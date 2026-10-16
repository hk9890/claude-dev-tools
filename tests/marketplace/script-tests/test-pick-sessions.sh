#!/usr/bin/env bash
# test-pick-sessions.sh — scripts/pick-sessions.py against a generated projects dir and
# review store:
#   - pick: which sessions are candidates, what each signal counts, which bucket takes
#     which session, the version label of each skill use, and the run folder it starts
#   - pick, in a checkout with two release tags: what the release changed, and which
#     sessions the changed bucket takes
#   - record: the files of a reviewed run, and that a later pick skips its sessions
#     until one of them goes on
#   - render: the labels of the text form, the per-event cap, and the prompts the user
#     typed while the agent worked
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


def queued(prompt, origin):
    return {"type": "attachment", "timestamp": "2026-01-01T00:02:30.000Z",
            "attachment": {"type": "queued_command", "prompt": prompt, "origin": {"kind": origin}}}


def write(path, session_records):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("".join(json.dumps(r) + "\n" for r in session_records))


def run(*argv, **kwargs):
    return subprocess.run([sys.executable, SCRIPT, *argv], capture_output=True, text=True, **kwargs)


with tempfile.TemporaryDirectory() as tmp:
    projects, plugins, store = Path(tmp, "projects"), Path(tmp, "plugins"), Path(tmp, "store")
    # A checkout of its own, with no tag: git must not find one above the temporary directory.
    subprocess.run(["git", "init", tmp], check=True, capture_output=True)
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
        queued("stop, this is one file", "human"),
        queued("a task finished", "task-notification"),
        banner(f"{cache}/1.3.0/skills/skill", at="2026-01-01T00:03:00.000Z"),
        assistant("m8", 1, at="2026-01-01T00:03:05.000Z"),
    ])
    write(project / "pushback" / "subagents" / "workflows" / "wf_1" / "agent-1.jsonl", [
        user_text("[Workflow harness — user request] The harness relays the user request.\n  <command-name>/demo:skill</command-name>"),
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
        user_text("<command-name>/demo</command-name>"),
        banner("/home/u/worktrees/repo/.claude/worktrees/wt/plugins/demo/skills/skill"),
        banner("/tmp/bundled-skills/2.1.0/abc/plugin-authoring"),
        assistant("m5", 1),
    ])
    write(project / "foreign.jsonl", [assistant("m6", 5000, plugin="other-marketplace"), error("a")])
    write(project / "old.jsonl", [assistant("m7", 9000)])
    write(project / "big.jsonl", [assistant("m9", 1)])
    oversized = project / "big" / "subagents" / "agent-big.jsonl"
    oversized.parent.mkdir(parents=True)
    with open(oversized, "wb") as sparse:
        sparse.truncate(100 * 1024 * 1024)
    with open(project / "pushback" / "subagents" / "workflows" / "wf_1" / "journal.jsonl", "wb") as sparse:
        sparse.truncate(60 * 1024 * 1024)
    last_month = time.time() - 30 * 86400
    os.utime(project / "old.jsonl", (last_month, last_month))

    pick_args = ("pick", "--review-dir", str(store), "--projects-dir", str(projects), "--plugins-dir", str(plugins), "--per-bucket", "1", "--seed", "0")
    first = run(*pick_args)
    check("pick exits 0", 0, first.returncode)
    result = json.loads(first.stdout or "{}")
    by_name = {s["session_id"]: s for s in result.get("sessions", [])}

    check("a foreign-plugin session, an old session and one with a file of 100 MB are no candidates", 4, result.get("candidates"))
    check("a session with a file of 100 MB is refused, one with a file of 50 MB or more is listed and stays a candidate",
          [{"session_id": "big", "largest_file_mb": 100, "refused": True}, {"session_id": "pushback", "largest_file_mb": 60, "refused": False}],
          result.get("large_transcripts"))
    check("both are warned about", (True, True),
          ("session big holds a 100 MB file, not picked" in first.stderr, "session pushback holds a 60 MB file, large" in first.stderr))
    check("each bucket takes its top session, random the rest",
          {"pushback": "pushback", "errors": "errors", "tokens": "output_tokens", "quiet": "random"},
          {name: s["bucket"] for name, s in by_name.items()})

    check("a checkout with fewer than two release tags has no release", None, result.get("release", "absent"))

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
    check("run.json lists the large transcripts too", result.get("large_transcripts"), run_record["large_transcripts"])
    check("picks.json holds what pick printed", result, json.loads((run_dir / "picks.json").read_text()))
    check("the pick points at the copy of the transcript", str(run_dir / "transcripts" / "pushback.jsonl"), pushback.get("transcript"))
    check("the copy holds the session and its subagents", True,
          (run_dir / "transcripts" / "pushback.jsonl").read_text() == (project / "pushback.jsonl").read_text()
          and (run_dir / "transcripts" / "pushback" / "subagents" / "workflows" / "wf_1" / "agent-1.jsonl").is_file())

    usage = (run_dir / "usage.md").read_text()
    check("usage counts sessions, turns, Skill calls and the slash commands the user typed per skill", True,
          "| `demo:skill` | 5 | 7 | 1 | 1 | 1.2.0, 1.3.0, dev@main, dev@wt, unknown |" in usage)
    check("a command with the bare name of a plugin is no skill of it", False, "| `demo` |" in usage)
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

    check("a reviewed session is no longer listed as large", ["big"], [s["session_id"] for s in second.get("large_transcripts", [])])

    with open(project / "pushback" / "subagents" / "workflows" / "wf_1" / "agent-1.jsonl", "a") as subagent:
        subagent.write(json.dumps(assistant("m10", 1, skill="other", at="2026-01-02T00:00:00.000Z")) + "\n")
    time.sleep(1.1)
    third = json.loads(run(*pick_args).stdout or "{}")
    check("a reviewed session that went on, in a subagent alone, is picked again",
          (1, True), (third.get("already_reviewed"), "pushback" in {s["session_id"] for s in third.get("sessions", [])}))

    review.write_text(json.dumps([{"session_id": "pushback", "findings": []}]))
    run("record", third.get("run_dir", tmp), str(review))
    time.sleep(1.1)
    fourth = json.loads(run(*pick_args).stdout or "{}")
    check("after its second review it is skipped again, with a record in both runs",
          (2, False, 2),
          (fourth.get("already_reviewed"), "pushback" in {s["session_id"] for s in fourth.get("sessions", [])}, len(list(store.glob("runs/*/sessions/pushback.json")))))

    no_store = run("pick", "--review-dir", str(Path(tmp, "missing")), "--projects-dir", str(projects), "--plugins-dir", str(plugins))
    check("pick stops with no review store, and names the variable", (2, True), (no_store.returncode, "SESSION_REVIEW_DIR" in no_store.stderr))
    empty_store = run("pick", "--projects-dir", str(projects), "--plugins-dir", str(plugins), cwd=tmp, env={**os.environ, "SESSION_REVIEW_DIR": ""})
    check("an empty SESSION_REVIEW_DIR is no review store: the working directory does not take its place", (2, False),
          (empty_store.returncode, Path(tmp, "runs").exists()))

    rendered = run("render", str(project / "pushback.jsonl"), "--max-chars", "40").stdout
    for label, needle in [
        ("render labels a user turn", "USER: [Request interrupted by user]"),
        ("render labels a tool call with its skill", 'ASSISTANT [demo:skill] TOOL Bash: {"command": "make"}'),
        ("render keeps the non-ASCII text of a tool input", 'TOOL Bash: {"command": "echo für"}'),
        ("render labels a failed result", "ERROR: exit status 1"),
        ("render caps an event and says how much it cut", "[... 74 more chars]"),
        ("render shows a prompt the user typed while the agent worked", "USER (queued): stop, this is one file"),
    ]:
        check(label, True, needle in rendered)
    check("render leaves out a queued task notification", False, "a task finished" in rendered)

with tempfile.TemporaryDirectory() as tmp:
    projects, plugins = Path(tmp, "projects"), Path(tmp, "plugins")
    project = projects / "proj"
    cache = "/home/u/.claude/plugins/cache/market"

    def git(*argv):
        subprocess.run(["git", "-C", tmp, "-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", "-c", "tag.gpgSign=false", *argv], check=True, capture_output=True)

    def release(tag, files):
        for path, text in files.items():
            Path(tmp, path).parent.mkdir(parents=True, exist_ok=True)
            Path(tmp, path).write_text(text)
        git("add", "-A")
        git("commit", "-m", tag)
        git("tag", tag)

    git("init")
    # 1.10.0 is the newer of the two as a version, and the older as text.
    release("v1.9.0", {
        ".claude-plugin/marketplace.json": json.dumps({"metadata": {"version": "1.10.0"}}),
        "plugins/demo/.claude-plugin/plugin.json": "1.9.0",
        "plugins/demo/skills/skill/SKILL.md": "a",
        "plugins/demo/skills/other/SKILL.md": "a",
        "plugins/demo/tests/demo.test.ts": "a",
        "plugins/bumped/.claude-plugin/plugin.json": "1.9.0",
        "plugins/bumped/skills/skill/SKILL.md": "a",
    })
    release("v1.10.0", {
        "plugins/demo/.claude-plugin/plugin.json": "1.10.0",
        "plugins/demo/skills/skill/SKILL.md": "b",
        "plugins/demo/tests/demo.test.ts": "b",
        "plugins/bumped/.claude-plugin/plugin.json": "1.10.0",
    })
    git("tag", "v1.11.0-rc1")
    git("tag", "notes")

    def session(name, tokens, path, plugin="demo", skill="skill", then=()):
        write(project / f"{name}.jsonl", [banner(path), assistant(name, tokens, plugin=plugin, skill=skill), *then])

    session("old-version", 900, f"{cache}/demo/1.9.0/skills/skill")
    session("other-skill-a", 5, f"{cache}/demo/1.10.0/skills/other", skill="other")
    session("other-skill-b", 5, f"{cache}/demo/1.10.0/skills/other", skill="other")
    session("other-skill-failed", 5, f"{cache}/demo/1.10.0/skills/other", skill="other", then=[error("exit status 1")])
    session("changed-skill", 5, f"{cache}/demo/1.10.0/skills/skill")
    session("checkout", 5, "/repo/plugins/demo/skills/skill")
    session("bumped-only", 5, f"{cache}/bumped/1.10.0/skills/skill", plugin="bumped")

    for seed in ("0", "1", "2"):
        # A store for each pick: two picks in the same second would start the same run folder.
        store = Path(tmp, f"store-{seed}")
        store.mkdir()
        out = run("pick", "--review-dir", str(store), "--projects-dir", str(projects), "--plugins-dir", str(plugins), "--per-bucket", "1", "--seed", seed)
        result = json.loads(out.stdout or "{}")
        by_bucket = {s["bucket"]: s for s in result.get("sessions", [])}
        check(f"seed {seed}: the changed bucket takes a session that ran the changed skill before one that ran another skill of the plugin",
              "changed-skill", by_bucket.get("changed", {}).get("session_id"))

    check("the release is the newest version tag against the one before it; a version bump and a test are no change, and a checkout session is no candidate",
          {"version": "1.10.0", "previous": "1.9.0", "plugins": ["demo"], "candidates": 4}, result.get("release"))
    check("run.json records the release", result.get("release"), json.loads(Path(result["run_dir"], "run.json").read_text())["release"])
    check("the pick names the files the release changed in the plugins the session ran",
          ["plugins/demo/skills/skill/SKILL.md"], by_bucket.get("changed", {}).get("changed_files"))
    check("a session at an older version carries no changed files, whatever its bucket",
          ("old-version", False), (by_bucket["output_tokens"]["session_id"], "changed_files" in by_bucket["output_tokens"]))
    check("a session of the changed plugin carries the changed files in another bucket too",
          ("other-skill-failed", ["plugins/demo/skills/skill/SKILL.md"]),
          (by_bucket["errors"]["session_id"], by_bucket["errors"].get("changed_files")))
    check("the random bucket takes one of the sessions left",
          True, by_bucket["random"]["session_id"] in {"other-skill-a", "other-skill-b", "checkout", "bumped-only"})

print(f"\nResults: {passed} passed, {failed} failed")
sys.exit(1 if failed else 0)
PYEOF
