#!/usr/bin/env bash
# test-pick-sessions.sh — scripts/pick-sessions.py against a generated projects dir:
#   - pick: which sessions are candidates, what each signal counts, and which bucket
#     takes which session
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
failures = 0


def check(label, expected, actual):
    global failures
    if expected == actual:
        print(f"PASS: {label}")
    else:
        failures += 1
        print(f"FAIL: {label} — expected {expected!r}, got {actual!r}")


def assistant(message_id, tokens, plugin="demo", content=None):
    return {
        "type": "assistant",
        "timestamp": "2026-01-01T00:00:00Z",
        "attributionPlugin": plugin,
        "attributionSkill": f"{plugin}:skill",
        "message": {
            "id": message_id,
            "usage": {"output_tokens": tokens},
            "content": content or [{"type": "text", "text": "working"}],
        },
    }


def user_text(text, at="2026-01-01T00:00:00.000Z"):
    return {"type": "user", "timestamp": at, "message": {"content": [{"type": "text", "text": text}]}}


def error(text, denial=None, at="2026-01-01T00:00:00.000Z"):
    record = {"type": "user", "timestamp": at, "message": {"content": [{"type": "tool_result", "is_error": True, "content": text}]}}
    if denial:
        record["toolDenialKind"] = denial
    return record


def write(path, session_records):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("".join(json.dumps(r) + "\n" for r in session_records))


def run(*argv):
    return subprocess.run([sys.executable, SCRIPT, *argv], capture_output=True, text=True, check=True).stdout


with tempfile.TemporaryDirectory() as tmp:
    projects, plugins = Path(tmp, "projects"), Path(tmp, "plugins")
    (plugins / "demo").mkdir(parents=True)
    project = projects / "proj"

    tool_calls = [
        {"type": "tool_use", "name": "Bash", "input": {"command": "make"}},
        {"type": "tool_use", "name": "Bash", "input": {"command": "echo für"}},
    ]
    rejection = "The user doesn't want to proceed with this tool use."
    write(project / "pushback.jsonl", [
        user_text("Base directory for this skill: /home/u/.claude/plugins/cache/market/demo/1.2.0/skills/skill"),
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
    ])
    write(project / "pushback" / "subagents" / "workflows" / "wf_1" / "agent-1.jsonl", [
        assistant("m2", 5),
        user_text("[Request interrupted by user]", at="2026-01-01T00:02:00.900Z"),
        error("This agent is isolated in the worktree /w, refusing"),
        error("exit status 2"),
    ])
    write(project / "errors.jsonl", [assistant("m3", 1), error("a"), error("b"), error("c")])
    write(project / "tokens.jsonl", [assistant("m4", 1000)])
    write(project / "quiet.jsonl", [assistant("m5", 1)])
    write(project / "foreign.jsonl", [assistant("m6", 5000, plugin="other-marketplace"), error("a")])
    write(project / "old.jsonl", [assistant("m7", 9000)])
    last_month = time.time() - 30 * 86400
    os.utime(project / "old.jsonl", (last_month, last_month))

    result = json.loads(run("pick", "--projects-dir", str(projects), "--plugins-dir", str(plugins), "--per-bucket", "1", "--seed", "0"))
    by_name = {Path(s["session"]).stem: s for s in result["sessions"]}

    check("a foreign-plugin session and an old session are no candidates", 4, result["candidates"])
    check("each bucket takes its top session, random the rest",
          {"pushback": "pushback", "errors": "errors", "tokens": "output_tokens", "quiet": "random"},
          {name: s["bucket"] for name, s in by_name.items()})

    pushback = by_name["pushback"]
    check("pushback counts an interrupt once: its rejections, its markers and the subagent it stopped", 2, pushback["pushback"])
    check("errors skip refusals, cancelled siblings and denials, and include subagents", 2, pushback["errors"])
    check("output tokens take the full usage of a message, subagents included", 15, pushback["output_tokens"])
    check("version comes from the skill banner", ["1.2.0"], pushback["versions"])
    check("subagent transcripts are counted", 1, pushback["subagents"])
    check("skills hold the attributed skill", ["demo:skill"], pushback["skills"])

    rendered = run("render", str(project / "pushback.jsonl"), "--max-chars", "40")
    for label, needle in [
        ("render labels a user turn", "USER: [Request interrupted by user]"),
        ("render labels a tool call with its skill", 'ASSISTANT [demo:skill] TOOL Bash: {"command": "make"}'),
        ("render keeps the non-ASCII text of a tool input", 'TOOL Bash: {"command": "echo für"}'),
        ("render labels a failed result", "ERROR: exit status 1"),
        ("render caps an event and says how much it cut", "[... 74 more chars]"),
    ]:
        check(label, True, needle in rendered)

sys.exit(1 if failures else 0)
PYEOF
