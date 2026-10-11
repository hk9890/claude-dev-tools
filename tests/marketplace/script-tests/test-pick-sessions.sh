#!/usr/bin/env bash
# test-pick-sessions.sh — scripts/pick-sessions.py against a generated projects dir and
# review store:
#   - pick: which sessions are candidates, what each signal counts, which bucket takes
#     which session, the version label of each skill use, and the run folder it starts
#   - record: the files of a reviewed run, and that a later pick skips its sessions
#   - render: the labels of the text form, and the per-event cap
set -uo pipefail

REPO_ROOT="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
[[ -n "$REPO_ROOT" ]] || { printf 'FAIL: cannot resolve repo root from %s\n' "${BASH_SOURCE[0]}" >&2; exit 1; }
SCRIPT="$REPO_ROOT/scripts/pick-sessions.py"

python3 - "$SCRIPT" <<'PYEOF'
import json
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path

SCRIPT = sys.argv[1]
passed = failed = 0


def check(label, expected, actual):
    global passed, failed
    if expected == actual:
        passed += 1
        print(f"PASS: {label}")
    else:
        failed += 1
        print(f"FAIL: {label} — expected {expected!r}, got {actual!r}")


def assistant(message_id, tokens, plugin="demo", skill="skill", content=None, at="2026-01-01T00:00:05.000Z"):
    return {
        "type": "assistant",
        "timestamp": at,
        "attributionPlugin": plugin,
        "attributionSkill": f"{plugin}:{skill}",
        "message": {
            "id": message_id,
            "usage": {"output_tokens": tokens},
            "content": content or [{"type": "text", "text": "working"}],
        },
    }


def user_text(text, at="2026-01-01T00:00:00.000Z"):
    return {"type": "user", "timestamp": at, "message": {"content": [{"type": "text", "text": text}]}}


def banner(path, at="2026-01-01T00:00:00.000Z"):
    return user_text(f"Base directory for this skill: {path}\n\nDo the work.", at=at)


def error(text, denial=None, at="2026-01-01T00:00:00.000Z"):
    record = {"type": "user", "timestamp": at, "message": {"content": [{"type": "tool_result", "is_error": True, "content": text}]}}
    if denial:
        record["toolDenialKind"] = denial
    return record


def write(path, session_records):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("".join(json.dumps(r) + "\n" for r in session_records))


def run(*argv):
    return subprocess.run([sys.executable, SCRIPT, *argv], capture_output=True, text=True)


with tempfile.TemporaryDirectory() as tmp:
    projects, plugins, store = Path(tmp, "projects"), Path(tmp, "plugins"), Path(tmp, "store")
    for skill in ("skill", "other", "idle"):
        (plugins / "demo" / "skills" / skill).mkdir(parents=True)
        (plugins / "demo" / "skills" / skill / "SKILL.md").write_text("---\n---\n")
    Path(tmp, ".claude-plugin").mkdir()
    Path(tmp, ".claude-plugin", "marketplace.json").write_text(json.dumps({"metadata": {"version": "9.9.9"}}))
    store.mkdir()
    project = projects / "proj"
    cache = "/home/u/.claude/plugins/cache/market/demo"

    tool_calls = [
        {"type": "tool_use", "name": "Bash", "input": {"command": "make"}},
        {"type": "tool_use", "name": "Bash", "input": {"command": "echo für"}},
    ]
    rejection = "The user doesn't want to proceed with this tool use."
    write(project / "pushback.jsonl", [
        banner(f"{cache}/1.2.0/skills/skill"),
        assistant("m1", 3, content=tool_calls),
        assistant("m1", 10),
        user_text("[Request interrupted by user]", at="2026-01-01T00:01:00.100Z"),
        error(rejection, denial="user-rejected", at="2026-01-01T00:02:00.100Z"),
        error(rejection, denial="user-rejected", at="2026-01-01T00:02:00.130Z"),
        user_text("[Request interrupted by user for tool use]", at="2026-01-01T00:02:00.150Z"),
        error("exit status 1 " + "x" * 100),
        error("This session is isolated in the worktree /w, refusing"),
        error("Cancelled: parallel tool call Bash(ls) errored"),
        error("<tool_use_error>Cancelled: parallel tool call Bash(ls) errored</tool_use_error>"),
        error("Refusing to write: it is a symbolic link", denial="permission-rule"),
        banner(f"{cache}/1.3.0/skills/skill", at="2026-01-01T00:03:00.000Z"),
        assistant("m8", 1, at="2026-01-01T00:03:05.000Z"),
    ])
    write(project / "pushback" / "subagents" / "workflows" / "wf_1" / "agent-1.jsonl", [
        assistant("m2", 5, skill="other"),
        user_text("[Request interrupted by user]", at="2026-01-01T00:02:00.900Z"),
        error("This agent is isolated in the worktree /w, refusing"),
        error("exit status 2"),
    ])
    write(project / "errors.jsonl", [assistant("m3", 1), error("a"), error("b"), error("c")])
    write(project / "tokens.jsonl", [
        banner("/repo/plugins/demo/skills/skill"),
        assistant("m4", 1000, content=[{"type": "tool_use", "name": "Skill", "input": {"skill": "demo:skill"}}]),
    ])
    write(project / "quiet.jsonl", [
        user_text("<command-name>/demo:skill</command-name>"),
        banner("/repo/.claude/worktrees/wt/plugins/demo/skills/skill"),
        banner("/tmp/bundled-skills/2.1.0/abc/plugin-authoring"),
        assistant("m5", 1),
    ])
    write(project / "foreign.jsonl", [assistant("m6", 5000, plugin="other-marketplace"), error("a")])
    write(project / "old.jsonl", [assistant("m7", 9000)])
    last_month = time.time() - 30 * 86400
    os.utime(project / "old.jsonl", (last_month, last_month))

    pick_args = ("pick", "--review-dir", str(store), "--projects-dir", str(projects), "--plugins-dir", str(plugins), "--per-bucket", "1", "--seed", "0")
    first = run(*pick_args)
    check("pick exits 0", 0, first.returncode)
    result = json.loads(first.stdout or "{}")
    by_name = {s["session_id"]: s for s in result.get("sessions", [])}

    check("a foreign-plugin session and an old session are no candidates", 4, result.get("candidates"))
    check("each bucket takes its top session, random the rest",
          {"pushback": "pushback", "errors": "errors", "tokens": "output_tokens", "quiet": "random"},
          {name: s["bucket"] for name, s in by_name.items()})

    pushback = by_name.get("pushback", {})
    check("pushback counts an interrupt once: its rejections, its markers and the subagent it stopped", 2, pushback.get("pushback"))
    check("errors skip refusals, cancelled siblings and denials, and include subagents", 2, pushback.get("errors"))
    check("output tokens take the full usage of a message, subagents included", 16, pushback.get("output_tokens"))
    check("subagent transcripts are counted", 1, pushback.get("subagents"))
    check("a skill takes the version of each banner that served it; a subagent turn takes its session's at that time",
          {"demo:other": ["1.2.0"], "demo:skill": ["1.2.0", "1.3.0"]}, pushback.get("skill_versions"))
    check("a worktree checkout is labelled by its name, and a bundled skill's banner is ignored",
          {"demo:skill": ["dev@wt"]}, by_name.get("quiet", {}).get("skill_versions"))
    check("any other checkout is dev@main", ["dev@main"], by_name.get("tokens", {}).get("versions"))
    check("a turn with no banner before it is unknown", ["unknown"], by_name.get("errors", {}).get("versions"))

    run_dir = Path(result.get("run_dir", tmp))
    check("the run folder is named for the marketplace version", True, run_dir.name.endswith("-v9.9.9") and run_dir.parent == store / "runs")
    run_record = json.loads((run_dir / "run.json").read_text())
    check("run.json records the version, the arguments and the counts", ("9.9.9", 1, 0, 4, 0),
          tuple(run_record[key] for key in ("marketplace_version", "per_bucket", "seed", "candidates", "already_reviewed")))
    check("picks.json holds what pick printed", result, json.loads((run_dir / "picks.json").read_text()))
    check("the pick points at the copy of the transcript", str(run_dir / "transcripts" / "pushback.jsonl"), pushback.get("transcript"))
    check("the copy holds the session and its subagents", True,
          (run_dir / "transcripts" / "pushback.jsonl").read_text() == (project / "pushback.jsonl").read_text()
          and (run_dir / "transcripts" / "pushback" / "subagents" / "workflows" / "wf_1" / "agent-1.jsonl").is_file())

    usage = (run_dir / "usage.md").read_text()
    check("usage counts sessions, turns, Skill calls and slash commands per skill", True,
          "| `demo:skill` | 4 | 6 | 1 | 1 | 1.2.0, 1.3.0, dev@main, dev@wt, unknown |" in usage)
    check("usage lists a shipped skill that no session used", True, "- `demo:idle`" in usage and "- `demo:other`" not in usage)

    review = Path(tmp, "result.json")
    finding = {"artifact": "plugins/demo/skills/skill/SKILL.md", "version": "1.3.0", "problem": "p", "quote": "q", "fix": "f"}
    review.write_text(json.dumps([
        {"session_id": "pushback", "findings": [{**finding, "refuted": False, "reason": "holds"}, {**finding, "refuted": True, "reason": "no quote"}]},
        {"session_id": "errors", "findings": []},
        {"session_id": "tokens", "findings": None},
    ]))
    check("record exits 0", 0, run("record", str(run_dir), str(review)).returncode)
    check("record writes a file for each session whose review finished", ["errors.json", "pushback.json"],
          sorted(p.name for p in (run_dir / "sessions").glob("*.json")))
    recorded = json.loads((run_dir / "sessions" / "pushback.json").read_text())
    check("a session file keeps the pick and every finding with its verdict", ("pushback", [False, True]),
          (recorded["bucket"], [f["refuted"] for f in recorded["findings"]]))
    check("findings.json holds the findings that survived, with their session",
          [{"session_id": "pushback", "bucket": "pushback", **finding, "refuted": False, "reason": "holds"}],
          json.loads((run_dir / "findings.json").read_text()))

    review.write_text(json.dumps([{"session_id": "not-picked", "findings": []}]))
    check("record refuses a session the run did not pick", 1, run("record", str(run_dir), str(review)).returncode)

    time.sleep(1.1)
    second = json.loads(run(*pick_args).stdout or "{}")
    check("a later pick skips the reviewed sessions, and keeps one whose review did not finish",
          (2, 2, ["quiet", "tokens"]),
          (second.get("candidates"), second.get("already_reviewed"), sorted(s["session_id"] for s in second.get("sessions", []))))

    no_store = run("pick", "--review-dir", str(Path(tmp, "missing")), "--projects-dir", str(projects), "--plugins-dir", str(plugins))
    check("pick stops with no review store, and names the variable", (2, True), (no_store.returncode, "SESSION_REVIEW_DIR" in no_store.stderr))

    rendered = run("render", str(project / "pushback.jsonl"), "--max-chars", "40").stdout
    for label, needle in [
        ("render labels a user turn", "USER: [Request interrupted by user]"),
        ("render labels a tool call with its skill", 'ASSISTANT [demo:skill] TOOL Bash: {"command": "make"}'),
        ("render keeps the non-ASCII text of a tool input", 'TOOL Bash: {"command": "echo für"}'),
        ("render labels a failed result", "ERROR: exit status 1"),
        ("render caps an event and says how much it cut", "[... 74 more chars]"),
    ]:
        check(label, True, needle in rendered)

print(f"\nResults: {passed} passed, {failed} failed")
sys.exit(1 if failed else 0)
PYEOF
