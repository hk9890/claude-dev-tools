#!/usr/bin/env python3
"""Pick local Claude Code sessions worth a review, and keep each review run.

pick    starts a run folder in the review store: picks the sessions that used a plugin of
        this marketplace and that no earlier run reviewed, a few from each bucket (most
        user pushback, most tool errors, most output tokens, random), and copies their
        transcripts into the run.
render  prints one transcript as text an agent can read in parts.
record  writes the findings of a review into its run folder.

The review store is the directory in SESSION_REVIEW_DIR, a checkout of a private repository.
"""

import argparse
import json
import os
import random
import re
import shutil
import socket
import subprocess
import sys
import time
from collections import defaultdict
from datetime import datetime
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

# Results with is_error set where no tool failed: Claude Code refused a command it
# could not prove stays in the worktree, or skipped the siblings of an interrupted batch.
# The refusal opens "This session is isolated" in a session and "This agent is isolated"
# in a subagent. Claude Code wraps some of its own errors in ERROR_TAG.
ISOLATION_REFUSAL = "is isolated in the worktree"
CANCELLED_SIBLING = "Cancelled: parallel tool call"
ERROR_TAG = "<tool_use_error>"

INTERRUPT = "[Request interrupted by user"
# One interrupt writes several records in the same second: a marker, a rejection for each
# call of a parallel batch, and a marker in each subagent it stopped.
TIMESTAMP_SECOND = len("2026-01-01T00:00:00")

# The banner Claude Code writes when it loads a skill. A cached install has the plugin
# version in the path (<plugin>/<version>/skills/<skill>); a checkout of this repository
# has none (plugins/<plugin>/skills/<skill>).
BANNER_RE = re.compile(r"Base directory for this skill:\s*(\S+)/skills/([A-Za-z0-9_-]+)")
VERSION_RE = re.compile(r"\d+\.\d+\.\d+")
WORKTREE_RE = re.compile(r"/\.claude/worktrees/([^/]+)/")
SLASH_COMMAND_RE = re.compile(r"<command-name>/([^<\s]+)</command-name>")

RANKED_BUCKETS = ("pushback", "errors", "output_tokens")

# GitHub refuses a file above 100 MB.
LARGE_TRANSCRIPT_BYTES = 50 * 1024 * 1024


def records(path):
    with open(path, encoding="utf-8", errors="replace") as lines:
        for line in lines:
            try:
                record = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(record, dict):
                yield record


def blocks(record):
    message = record.get("message")
    content = message.get("content") if isinstance(message, dict) else None
    if isinstance(content, str):
        return [{"type": "text", "text": content}]
    return [b for b in content or [] if isinstance(b, dict)]


def block_text(block):
    content = block.get("text", block.get("content", ""))
    if isinstance(content, list):
        return "\n".join(c.get("text", "") for c in content if isinstance(c, dict))
    return content if isinstance(content, str) else ""


def subagent_files(session_file):
    return sorted(session_file.with_suffix("").glob("subagents/**/agent-*.jsonl"))


def skill_load(text, plugins):
    """The skill a banner loads and the version label of its plugin, for a plugin in `plugins`."""
    banner = BANNER_RE.match(text)
    if not banner:
        return None
    root = Path(banner[1])
    if VERSION_RE.fullmatch(root.name):
        plugin, label = root.parent.name, root.name
    else:
        worktree = WORKTREE_RE.search(banner[1])
        plugin, label = root.name, (f"dev@{worktree[1]}" if worktree else "dev@main")
    if plugin not in plugins:
        return None
    return f"{plugin}:{banner[2]}", plugin, label


def summarize(session_file, plugins):
    """One session with its subagent transcripts: the pick record, and the use of each skill."""
    subagents = subagent_files(session_file)
    pushback_seconds = set()
    tokens_by_message = {}
    errors = 0
    started = None
    # A subagent turn has no banner of its own: it runs the version its session loaded last.
    session_loads = []
    usage = defaultdict(lambda: {"versions": set(), "turns": 0, "model_invoked": 0, "slash_invoked": 0})

    def owned(skill):
        return isinstance(skill, str) and ":" in skill and skill.split(":")[0] in plugins

    for path in [session_file, *subagents]:
        loaded = {}
        for record in records(path):
            timestamp = record.get("timestamp") or ""
            started = started or record.get("timestamp")
            if record.get("type") == "assistant":
                skill, plugin = record.get("attributionSkill"), record.get("attributionPlugin")
                if skill and plugin in plugins:
                    label = (
                        loaded.get(skill)
                        or loaded.get(plugin)
                        or next((l for at, name, _, l in reversed(session_loads) if at <= timestamp and name == skill), None)
                        or next((l for at, _, name, l in reversed(session_loads) if at <= timestamp and name == plugin), None)
                        or "unknown"
                    )
                    usage[skill]["versions"].add(label)
                    usage[skill]["turns"] += 1
                for block in blocks(record):
                    invoked = (block.get("input") or {}).get("skill") if block.get("name") == "Skill" else None
                    if owned(invoked):
                        usage[invoked]["model_invoked"] += 1
                # One API message spans several records, and its usage grows up to the last.
                message = record.get("message") or {}
                message_id = message.get("id")
                tokens = (message.get("usage") or {}).get("output_tokens", 0)
                tokens_by_message[message_id] = max(tokens_by_message.get(message_id, 0), tokens)
            elif record.get("type") == "user":
                denial = record.get("toolDenialKind")
                second = timestamp[:TIMESTAMP_SECOND]
                for block in blocks(record):
                    text = block_text(block)
                    if block.get("type") == "text":
                        if text.startswith(INTERRUPT):
                            pushback_seconds.add(second)
                        # The user types in the session only: a workflow subagent repeats the request that started it.
                        if path == session_file:
                            for command in SLASH_COMMAND_RE.findall(text):
                                if owned(command):
                                    usage[command]["slash_invoked"] += 1
                        load = skill_load(text, plugins)
                        if load:
                            skill, plugin, label = load
                            loaded[skill] = loaded[plugin] = label
                            if path == session_file:
                                session_loads.append((timestamp, skill, plugin, label))
                    elif block.get("type") == "tool_result" and block.get("is_error"):
                        if denial == "user-rejected":
                            pushback_seconds.add(second)
                        elif not (
                            denial
                            or ISOLATION_REFUSAL in text.lower()
                            or text.removeprefix(ERROR_TAG).startswith(CANCELLED_SIBLING)
                        ):
                            errors += 1

    skill_versions = {skill: sorted(use["versions"]) for skill, use in sorted(usage.items()) if use["turns"]}
    session = {
        "session_id": session_file.stem,
        "session": str(session_file),
        "project": session_file.parent.name,
        "started": started,
        "skills": list(skill_versions),
        "versions": sorted({label for labels in skill_versions.values() for label in labels}),
        "skill_versions": skill_versions,
        "subagents": len(subagents),
        "pushback": len(pushback_seconds),
        "errors": errors,
        "output_tokens": sum(tokens_by_message.values()),
    }
    return session, usage


def usage_table(usages, plugins_dir, since_days):
    total = defaultdict(lambda: {"sessions": 0, "versions": set(), "turns": 0, "model_invoked": 0, "slash_invoked": 0})
    for usage in usages:
        for skill, use in usage.items():
            total[skill]["sessions"] += 1
            total[skill]["versions"] |= use["versions"]
            for count in ("turns", "model_invoked", "slash_invoked"):
                total[skill][count] += use[count]

    lines = [
        "# Skill usage",
        "",
        f"The {len(usages)} sessions of the last {since_days:g} days that used a plugin of this marketplace, subagent transcripts included.",
        "",
        "| Skill | Sessions | Turns | Model-invoked | Slash-invoked | Versions |",
        "|---|---|---|---|---|---|",
    ]
    for skill, use in sorted(total.items()):
        lines.append(
            f"| `{skill}` | {use['sessions']} | {use['turns']} | {use['model_invoked']} | {use['slash_invoked']} | {', '.join(sorted(use['versions']))} |"
        )
    shipped = {f"{p.parent.parent.parent.name}:{p.parent.name}" for p in plugins_dir.glob("*/skills/*/SKILL.md")}
    lines += ["", "## Skills with no use in the window", ""]
    lines += [f"- `{skill}`" for skill in sorted(shipped - set(total))] or ["None."]
    return "\n".join(lines) + "\n"


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def copy_transcripts(session_file, transcripts_dir):
    """Copy a session and its subagent transcripts, in the layout Claude Code keeps them in."""
    copy = transcripts_dir / session_file.name
    transcripts_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(session_file, copy)
    subagents = session_file.with_suffix("") / "subagents"
    if subagents.is_dir():
        shutil.copytree(subagents, copy.with_suffix("") / "subagents")
    for path in [copy, *copy.with_suffix("").rglob("*")]:
        if path.is_file() and path.stat().st_size > LARGE_TRANSCRIPT_BYTES:
            print(f"warning: {path} is {path.stat().st_size >> 20} MB; GitHub refuses a file above 100 MB", file=sys.stderr)
    return copy


def pick(args):
    plugins_dir = Path(args.plugins_dir)
    plugins = {p.name for p in plugins_dir.iterdir() if p.is_dir()}
    reviewed = {p.stem for p in args.review_dir.glob("runs/*/sessions/*.json")}
    cutoff = time.time() - args.since_days * 86400
    recent = (
        f
        for f in sorted(Path(args.projects_dir).glob("*/*.jsonl"))
        if f.stat().st_mtime >= cutoff
    )
    summaries = [(session, usage) for session, usage in (summarize(f, plugins) for f in recent) if session["skills"]]
    candidates = [session for session, _ in summaries if session["session_id"] not in reviewed]

    picked = []
    for bucket in RANKED_BUCKETS:
        unpicked = [s for s in candidates if s[bucket] and "bucket" not in s]
        for session in sorted(unpicked, key=lambda s: -s[bucket])[: args.per_bucket]:
            session["bucket"] = bucket
            picked.append(session)
    unpicked = [s for s in candidates if "bucket" not in s]
    for session in random.Random(args.seed).sample(unpicked, min(args.per_bucket, len(unpicked))):
        session["bucket"] = "random"
        picked.append(session)

    marketplace = json.loads((plugins_dir.parent / ".claude-plugin" / "marketplace.json").read_text(encoding="utf-8"))
    version = marketplace["metadata"]["version"]
    now = datetime.now().astimezone()
    run_dir = args.review_dir / "runs" / f"{now:%Y-%m-%dT%H%M%S}-{socket.gethostname()}-v{version}"
    run_dir.mkdir(parents=True)
    for session in picked:
        session["transcript"] = str(copy_transcripts(Path(session["session"]), run_dir / "transcripts"))

    commit = subprocess.run(["git", "-C", str(REPO_ROOT), "rev-parse", "HEAD"], capture_output=True, text=True)
    picks = {
        "run_dir": str(run_dir),
        "candidates": len(candidates),
        "already_reviewed": len(summaries) - len(candidates),
        "sessions": picked,
    }
    write_json(run_dir / "run.json", {
        "started": now.isoformat(timespec="seconds"),
        "host": socket.gethostname(),
        "marketplace_version": version,
        "picker_commit": commit.stdout.strip(),
        "since_days": args.since_days,
        "per_bucket": args.per_bucket,
        "seed": args.seed,
        "candidates": picks["candidates"],
        "already_reviewed": picks["already_reviewed"],
    })
    write_json(run_dir / "picks.json", picks)
    (run_dir / "usage.md").write_text(usage_table([usage for _, usage in summaries], plugins_dir, args.since_days), encoding="utf-8")

    json.dump(picks, sys.stdout, indent=2, ensure_ascii=False)
    print()


def record(args):
    run_dir = Path(args.run_dir)
    picks = {s["session_id"]: s for s in json.loads((run_dir / "picks.json").read_text(encoding="utf-8"))["sessions"]}
    reviews = json.loads(Path(args.result).read_text(encoding="utf-8"))
    unknown = [r["session_id"] for r in reviews if r["session_id"] not in picks]
    if unknown:
        sys.exit(f"error: not a session of {run_dir / 'picks.json'}: {', '.join(unknown)}")

    survived = []
    for review in reviews:
        # A review that did not finish leaves the session for a later run to pick again.
        if review.get("findings") is None:
            continue
        session = picks[review["session_id"]]
        write_json(run_dir / "sessions" / f"{session['session_id']}.json", {**session, "findings": review["findings"]})
        survived += [
            {"session_id": session["session_id"], "bucket": session["bucket"], **finding}
            for finding in review["findings"]
            if not finding.get("refuted")
        ]
    write_json(run_dir / "findings.json", survived)
    reviewed = len(list(run_dir.glob("sessions/*.json")))
    print(f"{reviewed} of {len(picks)} sessions recorded, {len(survived)} findings survived: {run_dir}")


def render(args):
    def emit(label, text):
        text = text.strip()
        if len(text) > args.max_chars:
            text = f"{text[: args.max_chars]} [... {len(text) - args.max_chars} more chars]"
        if text:
            print(f"{label}: {text}\n")

    for record in records(args.transcript):
        if record.get("type") == "assistant":
            skill = record.get("attributionSkill")
            speaker = f"ASSISTANT [{skill}]" if skill else "ASSISTANT"
            for block in blocks(record):
                if block.get("type") == "text":
                    emit(speaker, block_text(block))
                elif block.get("type") == "tool_use":
                    emit(f"{speaker} TOOL {block.get('name')}", json.dumps(block.get("input"), ensure_ascii=False))
        elif record.get("type") == "user":
            for block in blocks(record):
                if block.get("type") == "text":
                    emit("USER", block_text(block))
                elif block.get("type") == "tool_result":
                    emit("ERROR" if block.get("is_error") else "RESULT", block_text(block))


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    commands = parser.add_subparsers(dest="command", required=True)

    pick_parser = commands.add_parser("pick", help="start a run: pick the sessions, copy their transcripts, print the picks as JSON")
    pick_parser.add_argument("--review-dir", type=Path, default=os.environ.get("SESSION_REVIEW_DIR") or None, help="the review store (default: $SESSION_REVIEW_DIR)")
    pick_parser.add_argument("--projects-dir", default=os.path.expanduser("~/.claude/projects"))
    pick_parser.add_argument("--plugins-dir", default=REPO_ROOT / "plugins")
    pick_parser.add_argument("--since-days", type=float, default=7, help="only sessions modified in the last N days (default: 7)")
    pick_parser.add_argument("--per-bucket", type=int, default=2, help="sessions to pick from each bucket (default: 2)")
    pick_parser.add_argument("--seed", type=int, help="seed of the random bucket, for a repeatable pick")
    pick_parser.set_defaults(run=pick)

    render_parser = commands.add_parser("render", help="print one transcript as text")
    render_parser.add_argument("transcript", help="a session .jsonl, or one of its subagent transcripts")
    render_parser.add_argument("--max-chars", type=int, default=600, help="characters kept per message or tool result (default: 600)")
    render_parser.set_defaults(run=render)

    record_parser = commands.add_parser("record", help="write the findings of a review into its run folder")
    record_parser.add_argument("run_dir", help="the run_dir that pick printed")
    record_parser.add_argument("result", help="a JSON file: [{session_id, findings: [{..., refuted}] or null}]")
    record_parser.set_defaults(run=record)

    args = parser.parse_args()
    if args.command == "pick" and not (args.review_dir and args.review_dir.is_dir()):
        parser.error("no review store: set SESSION_REVIEW_DIR to a checkout of the private session-data repository (docs/MONITORING.md)")
    args.run(args)


if __name__ == "__main__":
    main()
