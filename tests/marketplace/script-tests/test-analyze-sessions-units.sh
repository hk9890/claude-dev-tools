#!/usr/bin/env bash
# test-analyze-sessions-units.sh — direct unit tests for scripts/analyze-sessions.py
# functions that the fixture run cannot pin:
#   - discover_skill_modes: SKILL.md frontmatter → 'library' / 'user-only' / 'both'
#     classification (drives the summary.md Mode column)
#   - select_slice_sample: rocky top-N ordering, evenly-spaced baseline stride,
#     and no-duplicate output on lists larger than the fixture provides
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
SCRIPT="$REPO_ROOT/scripts/analyze-sessions.py"

python3 - "$SCRIPT" <<'PYEOF'
import importlib.util
import os
import sys
import tempfile

spec = importlib.util.spec_from_file_location("analyze_sessions", sys.argv[1])
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

PASS = 0
FAIL = 0

def ok(label):
    global PASS
    print(f"PASS: {label}")
    PASS += 1

def fail(label):
    global FAIL
    print(f"FAIL: {label}")
    FAIL += 1

def check(cond, label):
    ok(label) if cond else fail(label)


# ── discover_skill_modes ─────────────────────────────────────────────────────

def write_skill(plugins_dir, plugin, skill, frontmatter_lines):
    skill_dir = os.path.join(plugins_dir, plugin, "skills", skill)
    os.makedirs(skill_dir)
    with open(os.path.join(skill_dir, "SKILL.md"), "w", encoding="utf-8") as fh:
        fh.write("\n".join(frontmatter_lines) + "\n\n# Body\n")

with tempfile.TemporaryDirectory() as plugins_dir:
    write_skill(plugins_dir, "p", "lib-skill",
                ["---", "name: lib-skill", "user-invocable: false", "---"])
    write_skill(plugins_dir, "p", "user-only-skill",
                ["---", "name: user-only-skill", "user-invocable: true",
                 "disable-model-invocation: true", "---"])
    write_skill(plugins_dir, "p", "both-skill",
                ["---", "name: both-skill", "---"])
    write_skill(plugins_dir, "p", "no-frontmatter-skill",
                ["just a body, no frontmatter fences"])

    modes = mod.discover_skill_modes(plugins_dir)

    check(modes.get("p:lib-skill") == "library",
          "discover_skill_modes: user-invocable=false → library")
    check(modes.get("p:user-only-skill") == "user-only",
          "discover_skill_modes: disable-model-invocation=true → user-only")
    check(modes.get("p:both-skill") == "both",
          "discover_skill_modes: no flags → both")
    check(modes.get("p:no-frontmatter-skill") == "both",
          "discover_skill_modes: missing frontmatter defaults to both")
    check(len(modes) == 4,
          "discover_skill_modes: exactly the four skills classified")

check(mod.discover_skill_modes("/nonexistent-dir") == {},
      "discover_skill_modes: missing plugins dir → empty map")


# ── select_slice_sample ──────────────────────────────────────────────────────

def make_episode(i, friction_errors):
    ep = mod.Episode(
        episode_id=f"ep-{i:02d}", session_id="s", source_file="f",
        start_line=0, attribution_skill="p:s", attribution_plugin="p",
    )
    ep.turn_count = 1
    ep.tool_errors = friction_errors  # friction = 3.0 * friction_errors
    return ep

# 12 episodes with strictly decreasing friction: ep-00 rockiest … ep-11 smoothest
episodes = [make_episode(i, 12 - i) for i in range(12)]

sample = mod.select_slice_sample(episodes, rocky_n=3, baseline_n=3)
ids = [ep.episode_id for ep in sample]

check(ids[:3] == ["ep-00", "ep-01", "ep-02"],
      "select_slice_sample: rockiest N come first, in friction order")
# rest = ep-03..ep-11 (9 items), step = 9 // 3 = 3 → indices 0, 3, 6 of rest
check(ids[3:] == ["ep-03", "ep-06", "ep-09"],
      "select_slice_sample: baseline is an evenly-spaced stride over the rest")
check(len(ids) == len(set(ids)),
      "select_slice_sample: no episode appears twice")

# Fewer episodes than rocky_n: everything is rocky, baseline path is empty
small = mod.select_slice_sample(episodes[:2], rocky_n=5, baseline_n=5)
check([ep.episode_id for ep in small] == ["ep-00", "ep-01"],
      "select_slice_sample: fewer episodes than rocky_n → all returned, ordered")

# baseline_n larger than the remainder: no division crash, whole rest returned
sample = mod.select_slice_sample(episodes[:7], rocky_n=3, baseline_n=10)
check(len(sample) == 7,
      "select_slice_sample: baseline_n larger than remainder → all episodes, no crash")

print(f"\nResults: {PASS} passed, {FAIL} failed")
sys.exit(1 if FAIL else 0)
PYEOF
