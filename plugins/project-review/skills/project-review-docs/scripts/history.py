#!/usr/bin/env python3
"""history.py — the deterministic layer of the docs review's history stage.

Usage:
    history.py prompts  <repo-root> --out <dir> [--limit N] [--batch-size B]
    history.py evidence <repo-root> --scratch <dir> [--per-use-case K]

The history stage asks one question: for each documented use case, did past sessions
in this repository open the doc `AGENTS.md` routes them to, and did they open it
*before* the work of that kind started? `AGENTS.md` itself is always in context and
is never Read, so the destination doc is the only observable signal.

What is a *fact* here (and therefore lives in this script, never in an agent):

  - which session transcripts belong to this repository (including its worktrees)
  - the ordered user messages of each session, harness scaffolding stripped
  - which files each assistant turn read or wrote, and which commands it ran
  - whether the AGENTS.md route to a doc still reads exactly as it did when a segment
    ran, and therefore whether that segment is evidence about today's route
  - which segments survive that filter, newest first

What is NOT a fact and is deliberately absent: what a user message was *about*.
Intent is judgment. A model labels the messages between the two subcommands — this
script never pattern-matches a prompt to guess a use case, because a grep that
decides intent would quietly decide the stage's findings too.

`prompts` runs first and writes batches for the classifier. The classifier writes
`labels-*.json` back into the same directory. `evidence` then reads those labels and
does every remaining mechanical step, so the model between them only ever labels.

Exits 0 on success, 1 on bad invocation. Never non-zero for a repository with no
history — an empty result is an answer, not a failure.
"""

import argparse
import glob
import json
import os
import re
import subprocess
import sys

# ---------------------------------------------------------------------------
# Use case -> the doc AGENTS.md routes it to. Mirrors the canonical topic set in
# the authoring standard's project-setup.md; these keys are also the label
# vocabulary handed to the classifier, plus "none".
# ---------------------------------------------------------------------------

USE_CASE_DOCS = {
    "searching": "docs/OVERVIEW.md",
    "coding": "docs/CODING.md",
    "testing": "docs/TESTING.md",
    "running": "docs/RUNNING.md",
    "change-workflow": "docs/CHANGE-WORKFLOW.md",
    "reviewing": "docs/REVIEWING.md",
    "releasing": "docs/RELEASING.md",
    "monitoring": "docs/MONITORING.md",
}

# Harness-generated blocks inside a user record. They are scaffolding, not the
# user's prose, and feeding them to the classifier would drown the actual request.
# `<command-name>` is deliberately kept: a slash command is the strongest single
# signal of intent a user turn carries.
STRIP_BLOCKS = [
    "system-reminder", "local-command-stdout", "local-command-stderr",
    "local-command-caveat", "bash-stdout", "bash-stderr", "attachment",
    "command-message", "user-prompt-submit-hook", "task-notification",
]

_STRIP_RE = re.compile(
    r"<(" + "|".join(STRIP_BLOCKS) + r")>.*?</\1>", re.DOTALL)

WRITE_TOOLS = {"Edit", "Write", "NotebookEdit"}
READ_TOOLS = {"Read"}

# How many candidate segments to collect per requested one. The judge discards the
# ones that turn out not to be that kind of work; this is the slack that leaves.
COLLECT_FACTOR = 2

# Segments whose route has since been reworded are not evidence about today's route,
# but they are evidence about the old one — and "agents skipped this doc 35 of 36 times
# under the previous wording" is exactly what justifies having rewritten it. Summarize
# that many per use case rather than discarding it silently.
HISTORICAL_CAP = 25


# ---------------------------------------------------------------------------
# Locating this repository's transcripts
# ---------------------------------------------------------------------------

def git(repo_root, *args):
    """Run a git command in repo_root; return stdout or '' when git fails."""
    try:
        out = subprocess.run(["git", "-C", repo_root, *args],
                             capture_output=True, text=True, timeout=30)
    except (OSError, subprocess.SubprocessError):
        return ""
    return out.stdout.strip() if out.returncode == 0 else ""


def main_checkout(repo_root):
    """The main working tree, even when repo_root is a worktree.

    A worktree's transcripts land under their own project slug, so resolving to the
    main checkout is what lets one review see the history of all of them.
    """
    common = git(repo_root, "rev-parse", "--path-format=absolute", "--git-common-dir")
    if common:
        parent = os.path.dirname(common.rstrip("/"))
        if parent:
            return parent
    top = git(repo_root, "rev-parse", "--show-toplevel")
    return top or os.path.abspath(repo_root)


def slug_for(path):
    """Claude Code's project-directory encoding: every non-alphanumeric run to '-'."""
    return re.sub(r"[^a-zA-Z0-9]", "-", os.path.abspath(path))


def session_files(repo_root, projects_dir, limit):
    """Transcripts for this repo and any worktree under it, newest first."""
    root = main_checkout(repo_root)
    prefix = slug_for(root)
    files = []
    if not os.path.isdir(projects_dir):
        return root, []
    for entry in sorted(os.listdir(projects_dir)):
        # A worktree lives under the repo, so its slug extends the repo's. Guard the
        # boundary with '-' so a sibling repo sharing a name prefix is not swept in.
        if entry != prefix and not entry.startswith(prefix + "-"):
            continue
        files.extend(glob.glob(os.path.join(projects_dir, entry, "*.jsonl")))
    files.sort(key=lambda p: os.path.getmtime(p), reverse=True)
    if limit and limit > 0:
        files = files[:limit]
    return root, files


# ---------------------------------------------------------------------------
# Transcript parsing
# ---------------------------------------------------------------------------

def iter_records(path):
    """Yield (line_index, record) for every parseable JSON line."""
    try:
        with open(path, "r", errors="replace") as fh:
            for i, line in enumerate(fh):
                line = line.strip()
                if not line:
                    continue
                try:
                    yield i, json.loads(line)
                except (ValueError, TypeError):
                    continue
    except OSError:
        return


def user_prose(record):
    """The user's own text in a user record, or None.

    Only string content is the human turn. List content is tool_result output or an
    injected skill body — machine text that would swamp the classifier.
    """
    if record.get("type") != "user" or record.get("isSidechain"):
        return None
    content = record.get("message", {}).get("content")
    if not isinstance(content, str):
        return None
    text = _STRIP_RE.sub(" ", content)
    text = re.sub(r"\s+", " ", text).strip()
    return text or None


def tool_events(record):
    """(tool_name, target) for each tool call in an assistant record."""
    if record.get("type") != "assistant" or record.get("isSidechain"):
        return []
    content = record.get("message", {}).get("content")
    if not isinstance(content, list):
        return []
    events = []
    for block in content:
        if not isinstance(block, dict) or block.get("type") != "tool_use":
            continue
        name = block.get("name") or "?"
        data = block.get("input") or {}
        if not isinstance(data, dict):
            data = {}
        target = data.get("file_path") or data.get("notebook_path") or data.get("command") or ""
        events.append((name, str(target)[:300]))
    return events


def read_session(path, max_chars):
    """One session's user messages, keyed by transcript line index."""
    messages = []
    session_id = ""
    for i, rec in iter_records(path):
        session_id = session_id or rec.get("sessionId") or ""
        text = user_prose(rec)
        if text is None:
            continue
        messages.append({
            "turn": i,
            "ts": rec.get("timestamp", ""),
            "text": text[:max_chars],
        })
    return {
        "session_id": session_id or os.path.basename(path)[:-6],
        "file": path,
        "messages": messages,
    }


# ---------------------------------------------------------------------------
# Subcommand: prompts
# ---------------------------------------------------------------------------

def cmd_prompts(args):
    root, files = session_files(args.repo_root, args.projects_dir, args.limit)
    os.makedirs(args.out, exist_ok=True)

    sessions = []
    for path in files:
        session = read_session(path, args.max_chars)
        if session["messages"]:
            sessions.append(session)

    batches = []
    size = max(1, args.batch_size)
    for start in range(0, len(sessions), size):
        chunk = sessions[start:start + size]
        name = os.path.join(args.out, "prompts-%02d.json" % (len(batches) + 1))
        with open(name, "w") as fh:
            json.dump({
                "batch": len(batches) + 1,
                "use_cases": sorted(USE_CASE_DOCS),
                "sessions": chunk,
            }, fh, indent=1)
        batches.append({
            "file": name,
            "labels_file": os.path.join(
                args.out, "labels-%02d.json" % (len(batches) + 1)),
            "sessions": len(chunk),
            "messages": sum(len(s["messages"]) for s in chunk),
        })

    json.dump({
        "repo_root": root,
        "projects_dir": args.projects_dir,
        "transcripts_found": len(files),
        "sessions_with_prompts": len(sessions),
        "batches": batches,
    }, sys.stdout, indent=1)
    print()
    return 0


# ---------------------------------------------------------------------------
# Subcommand: evidence
# ---------------------------------------------------------------------------

def load_labels(scratch):
    """{session_id: {turn: use_case}} from every labels-*.json the classifier wrote."""
    labels = {}
    for path in sorted(glob.glob(os.path.join(scratch, "labels-*.json"))):
        try:
            with open(path) as fh:
                data = json.load(fh)
        except (OSError, ValueError):
            continue
        for entry in data.get("sessions", []):
            sid = entry.get("session_id")
            if not sid:
                continue
            per_turn = labels.setdefault(sid, {})
            for item in entry.get("labels", []):
                use_case = item.get("use_case")
                turn = item.get("turn")
                if use_case in USE_CASE_DOCS and isinstance(turn, int):
                    per_turn[turn] = use_case
    return labels


def build_segments(session, per_turn):
    """Consecutive same-label user messages become one segment.

    A segment runs from its first labelled message to the message that starts the
    next segment, so the tool calls in between are the work that message asked for.
    """
    messages = session["messages"]
    segments = []
    for pos, msg in enumerate(messages):
        use_case = per_turn.get(msg["turn"])
        if not use_case:
            continue
        if segments and segments[-1]["use_case"] == use_case and segments[-1]["_open"]:
            segments[-1]["end_turn"] = (messages[pos + 1]["turn"]
                                        if pos + 1 < len(messages) else None)
            continue
        for seg in segments:
            seg["_open"] = False
        segments.append({
            "use_case": use_case,
            "session_id": session["session_id"],
            "file": session["file"],
            "start_turn": msg["turn"],
            "end_turn": (messages[pos + 1]["turn"]
                         if pos + 1 < len(messages) else None),
            "ts": msg["ts"],
            "prompt": msg["text"][:400],
            "_open": True,
        })
    for seg in segments:
        seg.pop("_open", None)
    return segments


_AGENTS_CACHE = {}


def agents_md_at(repo_root, commit):
    """AGENTS.md as of `commit`, or the working tree when commit is None."""
    key = (repo_root, commit)
    if key in _AGENTS_CACHE:
        return _AGENTS_CACHE[key]
    if commit is None:
        try:
            with open(os.path.join(repo_root, "AGENTS.md"), "r", errors="replace") as fh:
                content = fh.read()
        except OSError:
            content = None
    else:
        content = git(repo_root, "show", "%s:AGENTS.md" % commit) or None
    _AGENTS_CACHE[key] = content
    return content


def route_for(content, doc):
    """The AGENTS.md line(s) routing to `doc`. '' when there is no route, None if no file."""
    if content is None:
        return None
    hits = [ln.strip() for ln in content.splitlines() if doc in ln]
    return "\n".join(hits)


def route_stability(repo_root, doc, since_ts, now_route):
    """Is this segment still evidence about the route that exists today?

    The stage concludes routed / late / missed — a claim about whether a file was
    *opened*, never about what was inside it. That behaviour was driven by the
    AGENTS.md route, which is always in the agent's context, and not by the doc's
    contents, which it had not seen. So the route is the thing that has to have held
    still; how much the doc itself churned is irrelevant to the question being asked,
    and filtering on it discards evidence for no reason. Route text is compared
    exactly (whitespace-normalized) — there is no threshold to tune.
    """
    if not since_ts:
        return {"stable": False, "reason": "segment has no timestamp"}
    commit = git(repo_root, "rev-list", "-1", "--before=" + since_ts, "HEAD")
    if not commit:
        return {"stable": False, "reason": "repository has no commit at segment time"}
    then_route = route_for(agents_md_at(repo_root, commit), doc)
    if then_route is None:
        return {"stable": False, "reason": "AGENTS.md did not exist yet"}
    if not then_route:
        return {"stable": False, "reason": "no route to this doc at the time"}
    if not now_route:
        return {"stable": False, "reason": "no route to this doc today"}
    if " ".join(then_route.split()) != " ".join(now_route.split()):
        return {"stable": False, "reason": "route reworded since",
                "then": then_route[:200], "now": now_route[:200]}
    return {"stable": True, "reason": "route unchanged", "route": now_route[:300]}


def segment_projection(path, start_turn, end_turn, doc):
    """What the agent did in this segment: doc reads, other reads, writes, commands."""
    doc_reads, writes, reads, commands = [], [], [], []
    for i, rec in iter_records(path):
        if i < start_turn:
            continue
        if end_turn is not None and i >= end_turn:
            break
        for name, target in tool_events(rec):
            if name in READ_TOOLS:
                (doc_reads if target.endswith(doc) else reads).append(
                    {"turn": i, "path": target})
            elif name in WRITE_TOOLS:
                writes.append({"turn": i, "path": target})
            elif name == "Bash":
                commands.append({"turn": i, "cmd": target[:200]})
    # The first action of this kind — the moment the route was supposed to have
    # already fired. A doc read after this turn is late, not routed.
    work_turns = [e["turn"] for e in writes] + [e["turn"] for e in commands]
    first_work = min(work_turns) if work_turns else None
    return {
        "doc_reads": doc_reads[:10],
        "first_doc_read_turn": doc_reads[0]["turn"] if doc_reads else None,
        "first_work_turn": first_work,
        "writes": writes[:25],
        "other_reads": reads[:25],
        "commands": commands[:25],
        "counts": {"writes": len(writes), "commands": len(commands),
                   "reads": len(reads), "doc_reads": len(doc_reads)},
    }


def cmd_evidence(args):
    root, files = session_files(args.repo_root, args.projects_dir, 0)
    labels = load_labels(args.scratch)

    by_use_case = {u: [] for u in USE_CASE_DOCS}
    for path in files:
        session = read_session(path, 400)
        per_turn = labels.get(session["session_id"])
        if not per_turn:
            continue
        for seg in build_segments(session, per_turn):
            by_use_case[seg["use_case"]].append(seg)

    # Over-collect. The classifier labels from user prose alone, so some segments turn
    # out not to be that kind of work at all; the judge discards those, but only after
    # they have taken a slot. Handing it COLLECT_FACTOR x the target means discarding
    # two still leaves a verdict. Costs rows in a JSON file, not agents.
    target = max(1, args.per_use_case) * COLLECT_FACTOR

    result = {"repo_root": root, "per_use_case": args.per_use_case,
              "candidates_per_use_case": target, "use_cases": []}

    for use_case, doc in sorted(USE_CASE_DOCS.items()):
        segments = sorted(by_use_case[use_case],
                          key=lambda s: s["ts"] or "", reverse=True)
        entry = {"use_case": use_case, "doc": doc, "segments": [],
                 "coverage": {"labelled": len(segments), "examined": 0, "valid": 0,
                              "excluded_route_changed": 0}}
        # A use case with no doc is not reviewed at all — the standard makes topic
        # docs optional, so an absent one is a choice, never a finding.
        if not os.path.isfile(os.path.join(args.repo_root, doc)):
            entry["coverage"]["doc_missing"] = True
            result["use_cases"].append(entry)
            continue
        now_route = route_for(agents_md_at(args.repo_root, None), doc)
        entry["route_today"] = (now_route or "")[:300]
        stab_cache = {}
        historical = {}
        hist_examined = 0
        for seg in segments:
            # Stop once BOTH budgets are met. Walking further only inflated the exclusion
            # count and spent a git call per segment.
            if len(entry["segments"]) >= target and hist_examined >= HISTORICAL_CAP:
                break
            entry["coverage"]["examined"] += 1
            stab = stab_cache.get(seg["ts"])
            if stab is None:
                stab = route_stability(args.repo_root, doc, seg["ts"], now_route)
                stab_cache[seg["ts"]] = stab
            if not stab["stable"]:
                entry["coverage"]["excluded_route_changed"] += 1
                if hist_examined < HISTORICAL_CAP:
                    hist_examined += 1
                    then = stab.get("then") or "(no route to this doc at the time)"
                    bucket = historical.setdefault(then, {
                        "route_then": then, "segments": 0, "opened_doc": 0,
                        "did_work": 0, "first_ts": seg["ts"], "last_ts": seg["ts"]})
                    proj = segment_projection(
                        seg["file"], seg["start_turn"], seg["end_turn"], doc)
                    bucket["segments"] += 1
                    if proj["first_doc_read_turn"] is not None:
                        bucket["opened_doc"] += 1
                    if proj["first_work_turn"] is not None:
                        bucket["did_work"] += 1
                    bucket["first_ts"] = min(bucket["first_ts"], seg["ts"] or "")
                    bucket["last_ts"] = max(bucket["last_ts"], seg["ts"] or "")
                continue
            if len(entry["segments"]) >= target:
                continue
            entry["coverage"]["valid"] += 1
            entry["segments"].append({
                "session_id": seg["session_id"],
                "ts": seg["ts"],
                "prompt": seg["prompt"],
                "route_stability": stab,
                "activity": segment_projection(
                    seg["file"], seg["start_turn"], seg["end_turn"], doc),
            })
        # Superseded-route evidence: reported, never a finding about current text.
        entry["historical"] = sorted(
            historical.values(), key=lambda b: b["segments"], reverse=True)
        entry["coverage"]["historical_examined"] = hist_examined
        if entry["coverage"]["excluded_route_changed"] > hist_examined:
            entry["coverage"]["historical_truncated"] = (
                entry["coverage"]["excluded_route_changed"] - hist_examined)
        result["use_cases"].append(entry)

    out = os.path.join(args.scratch, "evidence.json")
    with open(out, "w") as fh:
        json.dump(result, fh, indent=1)
    summary = {
        "evidence_file": out,
        "sessions_scanned": len(files),
        "sessions_labelled": len(labels),
        "per_use_case": args.per_use_case,
        "candidates_per_use_case": target,
        "coverage": {e["use_case"]: e["coverage"] for e in result["use_cases"]},
        # Superseded-route evidence travels in the summary too: synthesis never opens
        # evidence.json, and dropping it here is how it would go quiet again.
        "historical": {e["use_case"]: e["historical"]
                       for e in result["use_cases"] if e.get("historical")},
    }
    json.dump(summary, sys.stdout, indent=1)
    print()
    return 0


# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    default_projects = os.path.expanduser("~/.claude/projects")
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("prompts", help="extract user messages for classification")
    p.add_argument("repo_root")
    p.add_argument("--out", required=True)
    p.add_argument("--limit", type=int, default=0)
    p.add_argument("--batch-size", type=int, default=12)
    p.add_argument("--max-chars", type=int, default=600)
    p.add_argument("--projects-dir", default=default_projects)
    p.set_defaults(func=cmd_prompts)

    e = sub.add_parser("evidence", help="filter, stratify, and project labelled segments")
    e.add_argument("repo_root")
    e.add_argument("--scratch", required=True)
    e.add_argument("--per-use-case", type=int, default=3)
    e.add_argument("--projects-dir", default=default_projects)
    e.set_defaults(func=cmd_evidence)

    args = parser.parse_args()
    if not os.path.isdir(args.repo_root):
        print("history.py: repo root is not a directory: %s" % args.repo_root,
              file=sys.stderr)
        return 1
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
