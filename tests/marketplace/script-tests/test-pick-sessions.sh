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
#   - pick --host: the mirror of another machine over ssh, the run named for it, and one
#     candidate for a session that two project folders hold
#   - the context scan: what each file of the checkout put into context, by channel, its
#     readers, reach, re-reads and trouble; the context judgments record keeps; and the
#     context trend over the runs
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
    Path(tmp, ".claude-plugin", "marketplace.json").write_text(json.dumps({"name": "market", "metadata": {"version": "9.9.9"}}))
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
        queued([{"type": "text", "text": "and keep the tests"}, {"type": "image", "source": {}}], "human"),
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
    check("usage.md says what its invocation columns count", (True, True),
          ("Model-invoked counts the Skill tool calls" in usage, "`disable-model-invocation: true` has 0 model invocations by design" in usage))

    legend = result.get("legend", {})
    check("pick prints a legend of each bucket, in the order the buckets fill",
          ["pushback", "errors", "output_tokens", "changed", "random"], list(legend.get("buckets", {})))
    check("the legend names each version label", ["x.y.z", "dev@<name>", "dev@main", "unknown"], list(legend.get("skill_versions", {})))
    check("the legend says what the signals count", True, "subagent transcripts" in legend.get("signals", ""))
    check("the legend says a subagent's inherited label is an inference", True, "an inference" in legend.get("label_source", ""))

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
        ("render shows the text of a queued prompt that carries an image", "USER (queued): and keep the tests"),
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
        ".claude-plugin/marketplace.json": json.dumps({"name": "market", "metadata": {"version": "1.10.0"}}),
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

with tempfile.TemporaryDirectory() as tmp:
    plugins, store, home, cache = (Path(tmp, name) for name in ("plugins", "store", "home", "cache"))
    subprocess.run(["git", "init", tmp], check=True, capture_output=True)
    (plugins / "demo" / "skills" / "skill").mkdir(parents=True)
    (plugins / "demo" / "skills" / "skill" / "SKILL.md").write_text("---\n---\n")
    Path(tmp, ".claude-plugin").mkdir()
    Path(tmp, ".claude-plugin", "marketplace.json").write_text(json.dumps({"name": "market", "metadata": {"version": "9.9.9"}}))
    store.mkdir()
    remote = home / ".claude" / "projects"
    write(remote / "old-name" / "moved.jsonl", [assistant("m1", 1, at="2026-01-01T00:00:01.000Z")])
    write(remote / "new-name" / "moved.jsonl", [assistant("m1", 1, at="2026-01-01T00:00:01.000Z"), assistant("m2", 7, at="2026-01-02T00:00:00.000Z")])
    write(remote / "new-name" / "moved" / "subagents" / "agent-1.jsonl", [assistant("m3", 1)])
    write(remote / "new-name" / "other.jsonl", [assistant("m4", 1)])
    # Claude Code links a forked subagent's transcript into a second session by its absolute path.
    linked = remote / "new-name" / "other" / "subagents" / "agent-1.jsonl"
    linked.parent.mkdir(parents=True)
    linked.symlink_to(remote / "new-name" / "moved" / "subagents" / "agent-1.jsonl")

    # An ssh that runs the command here, in the host's home: rsync calls ssh <options> <host> <command>.
    bin_dir = Path(tmp, "bin")
    bin_dir.mkdir()
    Path(bin_dir, "ssh").write_text(f"""#!/bin/sh
while [ "$1" = "-o" ]; do shift 2; done
[ "$1" = "unreachable" ] && {{ echo "ssh: connect to host unreachable: No route to host" >&2; exit 255; }}
shift
cd {home} && exec sh -c "$*"
""")
    Path(bin_dir, "ssh").chmod(0o755)
    env = {**os.environ, "PATH": f"{bin_dir}:{os.environ['PATH']}", "XDG_CACHE_HOME": str(cache)}

    def pick_host(host):
        return run("pick", "--review-dir", str(store), "--plugins-dir", str(plugins), "--host", host, "--per-bucket", "1", env=env)

    out = pick_host("box")
    check("pick --host exits 0", 0, out.returncode)
    result = json.loads(out.stdout or "{}")
    mirrored = cache / "claude-dev-tools" / "session-mirrors" / "box" / "projects"
    check("pick --host mirrors the host's projects, subagents included", True, (mirrored / "new-name" / "moved" / "subagents" / "agent-1.jsonl").is_file())
    mirrored_link = mirrored / "new-name" / "other" / "subagents" / "agent-1.jsonl"
    check("the mirror holds the file an absolute link of the host points to, not the link", (True, False),
          (mirrored_link.is_file(), mirrored_link.is_symlink()))
    run_dir = Path(result.get("run_dir", tmp))
    check("the run is named for the host", (True, "box"),
          ("-box-v9.9.9" in run_dir.name, json.loads((run_dir / "run.json").read_text()).get("host") if (run_dir / "run.json").is_file() else None))
    check("a session in two project folders is one candidate", 2, result.get("candidates"))
    moved = next((s for s in result.get("sessions", []) if s["session_id"] == "moved"), {})
    check("the pick reads the copy that ended last, and copies it", (str(mirrored / "new-name" / "moved.jsonl"), True),
          (moved.get("session"), (run_dir / "transcripts" / "moved" / "subagents" / "agent-1.jsonl").is_file()))
    check("the pick warns about the second copy", True, "session moved is in" in out.stderr)

    (remote / "old-name" / "moved.jsonl").unlink()
    time.sleep(1.1)
    pick_host("box")
    check("the mirror drops a file that the host deleted", False, (mirrored / "old-name" / "moved.jsonl").exists())

    unreachable = pick_host("unreachable")
    check("an rsync that fails stops the pick, with its message and no run", (1, True, 2),
          (unreachable.returncode, "No route to host" in unreachable.stderr, len(list(store.glob("runs/*")))))
    bad = pick_host("../x")
    check("a host that is no plain name is refused", (1, True), (bad.returncode, "no ssh host name" in bad.stderr))
    empty = pick_host("")
    check("an empty host is refused, not read as this machine", (1, True), (empty.returncode, "no ssh host name" in empty.stderr))

    # rsync exits 24 where a file vanished on the host during the transfer.
    vanishing_bin = Path(tmp, "vanishing-bin")
    vanishing_bin.mkdir()
    Path(vanishing_bin, "rsync").write_text("#!/bin/sh\necho 'file has vanished: \"/x\"' >&2\nexit 24\n")
    Path(vanishing_bin, "rsync").chmod(0o755)
    time.sleep(1.1)
    vanished = run("pick", "--review-dir", str(store), "--plugins-dir", str(plugins), "--host", "box", "--per-bucket", "1",
                   env={**env, "PATH": f"{vanishing_bin}:{env['PATH']}"})
    check("a file that vanished on the host during the transfer does not stop the pick", 0, vanished.returncode)
    both = run("pick", "--review-dir", str(store), "--projects-dir", str(remote), "--host", "box", env=env)
    check("--host and --projects-dir exclude each other", 2, both.returncode)

with tempfile.TemporaryDirectory() as tmp:
    projects, store = Path(tmp, "projects"), Path(tmp, "store")
    store.mkdir()
    # The checkout under test: its tracked files and the title of its AGENTS.md name it.
    for path, text in {
        "AGENTS.md": "# Repo title\n\nRoutes.\n",
        "docs/CODING.md": "rules\n",
        "plugins/demo/skills/skill/SKILL.md": "---\n---\n",
        "plugins/demo/references/r.md": "ref\n",
        ".claude-plugin/marketplace.json": json.dumps({"name": "market", "metadata": {"version": "9.9.9"}}),
    }.items():
        Path(tmp, path).parent.mkdir(parents=True, exist_ok=True)
        Path(tmp, path).write_text(text)
    subprocess.run(["git", "init", tmp], check=True, capture_output=True)
    subprocess.run(["git", "-C", tmp, "add", "-A"], check=True, capture_output=True)
    plugins = Path(tmp, "plugins")

    checkout, install = "/w/repo", "/c/.claude/plugins/cache/market/demo/1.0.0"
    agents_md = "# Repo title\n\nRoutes.\n"
    listing = "- demo:skill: Does a thing.\n- other:x: Foreign.\n- demo:idle: Idle."

    def attachment(kind, **fields):
        return {"type": "attachment", "timestamp": "2026-01-01T00:00:00.000Z", "attachment": {"type": kind, **fields}}

    def call(message_id, tool, use_id, plugin="demo", **arguments):
        return assistant(message_id, 1, plugin=plugin, content=[{"type": "tool_use", "id": use_id, "name": tool, "input": arguments}])

    def result(use_id, text, is_error=False, denial=None):
        record = {"type": "user", "timestamp": "2026-01-01T00:00:00.000Z",
                  "message": {"content": [{"type": "tool_result", "tool_use_id": use_id, "is_error": is_error, "content": text}]}}
        if denial:
            record["toolDenialKind"] = denial
        return record

    write(projects / "proj" / "s1.jsonl", [
        attachment("instructions", files=[{"path": f"{checkout}/AGENTS.md", "content": agents_md}, {"path": "/home/u/.claude/CLAUDE.md", "content": "mine"}]),
        attachment("skill_listing", content=listing),
        attachment("agent_listing_delta", addedLines=["- demo:reviewer: Reviews.", "- Explore: Searches."]),
        banner(f"{install}/skills/skill"),
        call("m1", "Read", "r1", file_path=f"{checkout}/docs/CODING.md"),
        result("r1", "C" * 100),
        # A skill reaches a file of its plugin root through its base directory.
        call("m2", "Read", "r2", file_path=f"{install}/skills/skill/../../references/r.md"),
        result("r2", "R" * 50),
        call("m3", "Read", "r3", file_path=f"{checkout}/docs/CODING.md"),
        result("r3", "C" * 100),
        call("m4", "Edit", "e1", file_path=f"{checkout}/.claude/worktrees/wt/plugins/demo/skills/skill/SKILL.md"),
        result("e1", "The file has been updated."),
        call("m5", "Read", "r4", file_path=f"{checkout}/scratch/notes.md"),
        result("r4", "N" * 10),
        assistant("m6", 1, content=[{"type": "tool_use", "id": "b1", "name": "Bash", "input": {"command": "make"}},
                                    {"type": "tool_use", "id": "b2", "name": "Bash", "input": {"command": "make test"}}]),
        result("b1", "The user doesn't want to proceed with this tool use.", is_error=True, denial="user-rejected"),
        result("b2", "exit status 1", is_error=True),
        {"type": "system", "subtype": "compact_boundary", "timestamp": "2026-01-01T00:00:00.000Z"},
        attachment("invoked_skills", skills=[{"path": "plugin:demo:skill", "content": f"Base directory for this skill: {install}/skills/skill\n\nBody."}]),
        attachment("file", filename=f"{checkout}/docs/TESTING.md", content={"type": "text", "file": {"filePath": f"{checkout}/docs/TESTING.md", "content": "T" * 40}}),
        attachment("edited_text_file", filename=f"{checkout}/docs/TESTING.md", snippet="T" * 5),
        assistant("m7", 1),
        assistant("m8", 1),
    ])
    # A subagent loads no instructions of its own here: it reads the checkout of its session.
    validator = projects / "proj" / "s1" / "subagents" / "agent-v.jsonl"
    write(validator, [
        call("v1", "Read", "r9", plugin="none", file_path=f"{checkout}/docs/CODING.md"),
        result("r9", "C" * 100),
        assistant("v2", 1, plugin="none", content=[
            {"type": "tool_use", "id": "e9", "name": "Edit", "input": {"file_path": f"{checkout}/docs/CODING.md"}},
            {"type": "tool_use", "id": "r10", "name": "Read", "input": {"file_path": f"{checkout}/docs/OVERVIEW.md"}},
        ]),
        result("e9", "String to replace not found in file.", is_error=True),
        result("r10", "File does not exist.", is_error=True),
    ])
    validator.with_suffix(".meta.json").write_text(json.dumps({"agentType": "plugin-dev:plugin-validator"}))
    # An agent of a Workflow run that a demo:skill turn started carries that skill.
    workflow_agent = projects / "proj" / "s1" / "subagents" / "workflows" / "wf_1" / "agent-w.jsonl"
    write(workflow_agent, [
        call("w1", "Bash", "w1", command="make"),
        result("w1", "exit status 2", is_error=True),
        call("w2", "Bash", "w2", command="make clean"),
        result("w2", "The user doesn't want to proceed with this tool use.", is_error=True, denial="user-rejected"),
    ])
    workflow_agent.with_suffix(".meta.json").write_text(json.dumps({"agentType": "workflow-subagent"}))
    # A plain subagent carries the skill of its parent turn too, and one that loads the skill itself does not, from that load on.
    # An agent of a plugin whose name only starts with the skill's plugin name is a plain subagent.
    write(projects / "proj" / "s1" / "subagents" / "agent-x.jsonl", [
        call("x1", "Bash", "x1", command="ls"),
        result("x1", "exit status 2", is_error=True),
    ])
    (projects / "proj" / "s1" / "subagents" / "agent-x.meta.json").write_text(json.dumps({"agentType": "demo-extra:helper"}))
    write(projects / "proj" / "s1" / "subagents" / "agent-y.jsonl", [
        call("y0", "Bash", "y0", command="pwd"),
        result("y0", "exit status 2", is_error=True),
        banner(f"{install}/skills/skill"),
        call("y1", "Bash", "y1", command="ls"),
        result("y1", "exit status 2", is_error=True),
    ])
    # A fork has the skill in its context, and an agent of the skill's plugin works for it: neither inherits.
    for name, kind in (("agent-f", "fork"), ("agent-r", "demo:reviewer")):
        write(projects / "proj" / "s1" / "subagents" / f"{name}.jsonl", [
            call(f"{name}1", "Bash", f"{name}1", command="ls"),
            result(f"{name}1", "exit status 2", is_error=True),
        ])
        (projects / "proj" / "s1" / "subagents" / f"{name}.meta.json").write_text(json.dumps({"agentType": kind}))
    # Another project with a docs/ of its own and no plugin use.
    write(projects / "other" / "s2.jsonl", [
        attachment("instructions", files=[{"path": "/w/other/AGENTS.md", "content": "# Other project\n"}]),
        call("o1", "Read", "o1", plugin="none", file_path="/w/other/docs/CODING.md"),
        result("o1", "X" * 100),
    ])

    def pick_context(projects=projects, store=store):
        out = run("pick", "--review-dir", str(store), "--projects-dir", str(projects), "--plugins-dir", str(plugins), "--per-bucket", "1", "--seed", "0")
        picks = json.loads(out.stdout or "{}")
        return out, picks, json.loads(Path(picks.get("run_dir", tmp), "context.json").read_text() or "{}")

    out, picks, context = pick_context()
    check("pick with the context scan exits 0", 0, out.returncode)
    files = {entry["file"]: entry for entry in context.get("files", [])}
    check("every session of the window is scanned, plugin use or none, subagents included", (8, 18), (context.get("contexts"), context.get("api_calls")))
    check("a listing entry of this marketplace counts, a foreign one does not",
          {"plugins/demo/skills/skill/SKILL.md": len("- demo:skill: Does a thing.\n"), "plugins/demo/skills/idle/SKILL.md": len("- demo:idle: Idle."),
           "plugins/demo/agents/reviewer.md": len("- demo:reviewer: Reviews.")},
          {file: entry["channels"]["listing"]["chars"] for file, entry in files.items() if "listing" in entry["channels"]})
    check("a text counts once for each API call after it, up to the next compaction", 6 * 28, files["plugins/demo/skills/skill/SKILL.md"]["channels"]["listing"]["char_reads"])
    check("the skill body and its copy after a compaction are channels of their own",
          (2, 1, 2), (files["plugins/demo/skills/skill/SKILL.md"]["channels"]["skill-body"]["loads"],
                      files["plugins/demo/skills/skill/SKILL.md"]["channels"]["skill-reinjected"]["loads"],
                      files["plugins/demo/skills/skill/SKILL.md"]["channels"]["skill-reinjected"]["char_reads"] // len(f"Base directory for this skill: {install}/skills/skill\n\nBody.")))
    check("the AGENTS.md of the checkout counts as instructions, the user's own CLAUDE.md does not",
          ({"instructions": {"loads": 1, "chars": len(agents_md), "char_reads": 6 * len(agents_md)}}, False),
          (files.get("AGENTS.md", {}).get("channels"), any("CLAUDE.md" in file for file in files)))
    check("a Read counts the size of its result, in the session and in its subagent", (300, 100 * 5 + 100 * 3 + 100 * 1),
          (files["docs/CODING.md"]["chars"], files["docs/CODING.md"]["char_reads"]))
    check("an install path through .. and a worktree path name the file of the repository, an untracked file and another project's do not",
          (True, False, False), ("plugins/demo/references/r.md" in files, "scratch/notes.md" in files, any("other" in file for file in files)))
    check("a file Claude Code attaches itself, whole or as a snippet of a change, is a channel of its own",
          {"attached": {"loads": 2, "chars": 45, "char_reads": 45 * 2}}, files.get("docs/TESTING.md", {}).get("channels"))
    check("readers: who read the file, and whether an edit of the repository followed; a failed edit is none",
          {"plugin-dev:plugin-validator": {"contexts": 1, "edited_after": 0}, "session": {"contexts": 1, "edited_after": 1}},
          context.get("readers", {}).get("docs/CODING.md"))
    check("a failed Read puts no file into context and makes no reader", (False, False),
          ("docs/OVERVIEW.md" in files, "docs/OVERVIEW.md" in context.get("readers", {})))
    check("reach: the files of the plugin read after the skill load",
          {"runs": 2, "read": {"plugins/demo/references/r.md": 1}}, context.get("reach", {}).get("plugins/demo/skills/skill/SKILL.md"))
    check("a second Read of the same part of a file is a re-read", {"docs/CODING.md": {"contexts": 2, "repeated": 1}}, context.get("rereads"))
    check("trouble: a failed call and a rejected call of a skill turn, by its version, and the turns a subagent inherits apart, a fork and an agent of its plugin excepted",
          {"turns": 11, "failed": 4, "rejected": 1, "inherited_turns": 4, "inherited_failed": 3, "inherited_rejected": 1},
          context.get("trouble", {}).get("demo:skill", {}).get("1.0.0"))
    check("context.md gives each count of the trouble its own column, the inherited counts last",
          ["| Skill | Version | Turns | Failed | Rejected | Inherited turns | Inherited failed | Inherited rejected |",
           "| `demo:skill` | 1.0.0 | 11 | 4 | 1 | 4 | 3 | 1 |"],
          [line for line in Path(picks["run_dir"], "context.md").read_text().splitlines() if line.startswith(("| Skill | Version |", "| `demo:skill` |"))])
    s1 = next((s for s in picks.get("sessions", []) if s["session_id"] == "s1"), {})
    check("a picked session carries the files of this repository it loaded, listing left out",
          ["AGENTS.md", "docs/CODING.md", "docs/TESTING.md", "plugins/demo/references/r.md", "plugins/demo/skills/skill/SKILL.md"], s1.get("context_files"))
    context_md = Path(picks["run_dir"], "context.md").read_text()
    check("context.md names what it does not count", True, "Not counted: what Bash commands print" in context_md)
    check("context.md names each channel and leaves usefulness to the reviewers", (True, True),
          ("Channels: listing (skill and agent listing entries)" in context_md, "the reviewers' judgment, in context-judgments.json" in context_md))

    review = Path(tmp, "result.json")
    judgment = {"artifact": "docs/CODING.md", "needed": "no", "unused": "all", "missing": "", "quote": "q"}
    review.write_text(json.dumps([{"session_id": "s1", "findings": [], "context": [{**judgment, "refuted": False}, {**judgment, "refuted": True}]}]))
    run("record", picks["run_dir"], str(review))
    check("record keeps the context judgments that survived, with their session",
          [{"session_id": "s1", **judgment, "refuted": False}], json.loads(Path(picks["run_dir"], "context-judgments.json").read_text()))

    time.sleep(1.1)
    pick_context()
    trend = run("context", "--review-dir", str(store), "--top", "2")
    run_names = sorted(p.name for p in (store / "runs").iterdir())
    check("context prints each file's characters per API call in each run, the costliest first",
          (0, f"| `docs/CODING.md` | {900 // 18} | {900 // 18} |"),
          (trend.returncode, next((line for line in trend.stdout.splitlines() if "docs/CODING.md" in line), None)))
    check("context names each run in its header", True, all(name in trend.stdout for name in run_names))
    empty = Path(tmp, "empty-store")
    empty.mkdir()
    check("context stops where no run holds a context.json", 1, run("context", "--review-dir", str(empty)).returncode)

    worktree_projects, worktree_store = Path(tmp, "worktree-projects"), Path(tmp, "worktree-store")
    worktree_store.mkdir()
    write(worktree_projects / "wt" / "s3.jsonl", [
        attachment("instructions", files=[{"path": f"{checkout}/.claude/worktrees/wt/AGENTS.md", "content": agents_md}]),
        call("w1", "Read", "w1", plugin="none", file_path=f"{checkout}/docs/CODING.md"),
        result("w1", "C" * 100),
        call("w2", "Read", "w2", plugin="none", file_path=f"{checkout}/.claude/worktrees/other/docs/CODING.md"),
        result("w2", "C" * 100),
    ])
    _, _, in_worktree = pick_context(worktree_projects, worktree_store)
    check("a session in a worktree reads the files of the checkout that holds it, and of its other worktrees",
          {"AGENTS.md": len(agents_md), "docs/CODING.md": 200}, {entry["file"]: entry["chars"] for entry in in_worktree.get("files", [])})

print(f"\nResults: {passed} passed, {failed} failed")
sys.exit(1 if failed else 0)
PYEOF
