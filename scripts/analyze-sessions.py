#!/usr/bin/env python3
"""analyze-sessions.py — Offline session-transcript indexer for Claude Code skill episodes.

Scans Claude Code session transcripts under ~/.claude/projects/*/*.jsonl,
identifies per-skill "episodes", and emits friction/outcome scoring to
output/session-analysis/.

Usage:
    python3 scripts/analyze-sessions.py [options]

Options:
    --projects-dir DIR   Root directory containing project subdirs
                         (default: ~/.claude/projects)
    --plugins-dir DIR    Root of the marketplace plugins directory
                         (default: <repo-root>/plugins)
    --output-dir DIR     Directory for output files
                         (default: <cwd>/output/session-analysis)
    --fixture FILE       Run against a single JSONL fixture file and write
                         output to a subdirectory of --output-dir/fixture/
    --max-slice-chars N  Max characters kept per tool output in episode slices
                         (default: 2000)
    --sample-rocky N     How many rocky episodes to include in slices sample
                         (default: 5)
    --sample-random N    How many random baseline episodes in slices sample
                         (default: 5)

Outputs (under output-dir/):
    dataset.json         Per-episode summary records (no raw message content)
    summary.md           Per-skill aggregates + unmatched plugins
    episodes/            Sanitized per-episode slice files

Stdlib only. Streams files line-by-line; never loads a whole file into memory.
"""

import json
import math
import os
import re
import sys
import uuid
from collections import defaultdict

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

RENAME_ALIASES = {
    "complexity-review": "project-review",
    "html-ask": "html-visualization",
}

# Skill-level rename aliases.  Keys are the raw attribution_skill strings that
# appear in older transcripts; values are the current canonical skill name.
# Applied before per-skill aggregation so renamed skills merge into a single row.
SKILL_RENAME_ALIASES = {
    # html-ask plugin era (plugin was later renamed to html-visualization)
    "html-ask:html-ask": "html-visualization:html-visualize",
    # intermediate names inside html-visualization before the unified skill
    "html-visualization:html-ask": "html-visualization:html-visualize",
    "html-visualization:html-feedback": "html-visualization:html-visualize",
    "html-visualization:visualize-html": "html-visualization:html-visualize",
    # project-docs skills (prefixed in a bulk rename)
    "project-docs:coder-docs": "project-docs:project-docs",
    "project-docs:create-docs": "project-docs:project-create-docs",
    "project-docs:improve-doc": "project-docs:project-improve-docs",
    "project-docs:project-improve-doc": "project-docs:project-improve-docs",
    "project-docs:init-or-update-docs": "project-docs:project-init-or-update-docs",
    "project-docs:review-docs": "project-docs:project-review-docs",
    "project-docs:revise-docs": "project-docs:project-revise-docs",
    # project-ops skills (prefixed in a bulk rename)
    "project-ops:analyze-monitoring-data": "project-ops:project-analyze-monitoring-data",
    "project-ops:executes-tests": "project-ops:project-run-tests",
    "project-ops:project-executes-tests": "project-ops:project-run-tests",
    "project-ops:trigger-release": "project-ops:project-trigger-release",
    # beads-tasks skills
    "beads-tasks:coder-beads": "beads-tasks:beads-core",
    # complexity-review plugin era (plugin was later renamed to project-review)
    "complexity-review:complexity-review": "project-review:complexity-review",
}

# Weight map for friction scoring
FRICTION_WEIGHTS = {
    "tool_errors": 3.0,
    "interruptions": 2.0,
    "permission_denials": 2.0,
    "user_corrections": 0.5,
    "retries": 1.0,
    "ask_user_questions": 0.5,
}

CORRECTION_RE = re.compile(
    r"\b(no|wrong|stop|don'?t|actually|revert)\b", re.IGNORECASE
)

CREDENTIAL_RE = re.compile(
    r"(?i)"
    r"(?:api[_-]?key|secret|token|password|passwd|auth|credential|private[_-]?key)"
    r"[=:\s]+[A-Za-z0-9+/=_\-]{8,}",
    re.IGNORECASE,
)

LONG_HEX_RE = re.compile(r"\b[0-9a-fA-F]{32,}\b")

# Patterns that suggest a commit was made
COMMIT_RE = re.compile(r"\bcommit\b|\bgit commit\b", re.IGNORECASE)
PR_RE = re.compile(r"\bpull.?request\b|\bgh pr create\b|\bpr url\b", re.IGNORECASE)

# Patterns that suggest tests were run
TEST_RUN_RE = re.compile(
    r"\b(pytest|npm test|go test|cargo test|make test|\.\/test)\b", re.IGNORECASE
)
TEST_PASS_RE = re.compile(
    r"\b(all tests pass(ed)?|test(s)? pass(ed)?|ok\b.*test|PASSED)\b",
    re.IGNORECASE,
)

# ---------------------------------------------------------------------------
# Helper: discover marketplace plugins
# ---------------------------------------------------------------------------

def discover_plugins(plugins_dir):
    """Return a set of current plugin names (after applying rename aliases).

    Scans plugins_dir for immediate subdirectories. Applies RENAME_ALIASES so
    both old and new names resolve to a canonical current name.
    Returns:
        canonical_names: set of current plugin directory names
        alias_to_canonical: mapping from any known alias to canonical name
    """
    canonical_names = set()
    if os.path.isdir(plugins_dir):
        for entry in os.listdir(plugins_dir):
            if os.path.isdir(os.path.join(plugins_dir, entry)):
                canonical_names.add(entry)

    # alias_to_canonical maps from old name -> canonical current name
    # and from canonical name -> itself
    alias_to_canonical = {}
    for alias, canonical in RENAME_ALIASES.items():
        alias_to_canonical[alias] = canonical
    for name in canonical_names:
        alias_to_canonical[name] = name

    return canonical_names, alias_to_canonical


def resolve_plugin(plugin_name, alias_to_canonical):
    """Resolve a plugin name to its canonical name, or None if unknown."""
    return alias_to_canonical.get(plugin_name)


# ---------------------------------------------------------------------------
# Episode data structure
# ---------------------------------------------------------------------------

class Episode:
    """Represents a contiguous run of assistant messages sharing attributionSkill."""

    def __init__(self, episode_id, session_id, source_file, start_line,
                 attribution_skill, attribution_plugin):
        self.episode_id = episode_id
        self.session_id = session_id
        self.source_file = source_file
        self.start_line = start_line
        self.end_line = start_line
        self.attribution_skill = attribution_skill
        self.attribution_plugin = attribution_plugin

        # Friction signals
        self.turn_count = 0
        self.tool_errors = 0
        self.interruptions = 0
        self.permission_denials = 0
        self.user_corrections = 0
        self.ask_user_questions = 0
        self.retries = 0       # repeated (tool_name, input_hash) pairs
        self.duration_ms = 0

        # Outcome signals
        self.ended_in_commit = False
        self.ended_in_pr = False
        self.tests_run = False
        self.tests_passed = False

        # Trigger classification
        self.trigger_type = "ambient"  # or "explicit"

        # Internal tracking for retry detection
        self._tool_calls_seen = {}  # (tool_name, input_repr) -> count

        # For slice output: lightweight line records (no raw content)
        self._slice_events = []

    def to_summary_record(self):
        """Return a JSON-serializable summary dict (no raw content)."""
        friction = self._compute_friction()
        return {
            "episode_id": self.episode_id,
            "session_id": self.session_id,
            "source_file": self.source_file,
            "start_line": self.start_line,
            "end_line": self.end_line,
            "attribution_skill": self.attribution_skill,
            "attribution_plugin": self.attribution_plugin,
            "trigger_type": self.trigger_type,
            "turn_count": self.turn_count,
            "tool_errors": self.tool_errors,
            "interruptions": self.interruptions,
            "permission_denials": self.permission_denials,
            "user_corrections": self.user_corrections,
            "ask_user_questions": self.ask_user_questions,
            "retries": self.retries,
            "duration_ms": self.duration_ms,
            "ended_in_commit": self.ended_in_commit,
            "ended_in_pr": self.ended_in_pr,
            "tests_run": self.tests_run,
            "tests_passed": self.tests_passed,
            "friction_score": friction,
        }

    def _compute_friction(self):
        """Compute normalized friction score (0=smooth, higher=rockier).

        Penalties normalized by turn_count to make episodes comparable
        regardless of length. Returns 0.0 if no turns.
        """
        if self.turn_count == 0:
            return 0.0
        raw = (
            self.tool_errors * FRICTION_WEIGHTS["tool_errors"]
            + self.interruptions * FRICTION_WEIGHTS["interruptions"]
            + self.permission_denials * FRICTION_WEIGHTS["permission_denials"]
            + self.user_corrections * FRICTION_WEIGHTS["user_corrections"]
            + self.retries * FRICTION_WEIGHTS["retries"]
            + self.ask_user_questions * FRICTION_WEIGHTS["ask_user_questions"]
        )
        return round(raw / self.turn_count, 4)

    def record_tool_call(self, tool_name, tool_input):
        """Track tool call for retry detection."""
        # Use a short fingerprint of the input to identify retries
        key = (tool_name, repr(tool_input)[:200])
        self._tool_calls_seen[key] = self._tool_calls_seen.get(key, 0) + 1
        if self._tool_calls_seen[key] == 2:
            # Count the first repeat only (not every subsequent)
            self.retries += 1


# ---------------------------------------------------------------------------
# JSONL parser — streaming, line-by-line
# ---------------------------------------------------------------------------

def iter_records(filepath):
    """Yield (line_number, parsed_dict) for each valid JSON line in filepath.

    Silently skips blank lines and unparseable JSON.
    Line numbers are 0-based.
    """
    with open(filepath, encoding="utf-8", errors="replace") as fh:
        for lineno, raw in enumerate(fh):
            raw = raw.strip()
            if not raw:
                continue
            try:
                yield lineno, json.loads(raw)
            except json.JSONDecodeError:
                continue


# ---------------------------------------------------------------------------
# Sanitizer for slice output
# ---------------------------------------------------------------------------

def sanitize_text(text, max_chars=2000):
    """Redact credential-looking strings, long hex, and cap length."""
    if not isinstance(text, str):
        text = repr(text)
    text = CREDENTIAL_RE.sub("[REDACTED]", text)
    text = LONG_HEX_RE.sub("[HEX]", text)
    if len(text) > max_chars:
        text = text[:max_chars] + f"... [truncated {len(text) - max_chars} chars]"
    return text


# ---------------------------------------------------------------------------
# Trigger detection helpers
# ---------------------------------------------------------------------------

def _skill_args_match(skill_arg, attribution_skill):
    """Return True if skill_arg (from Skill tool input) targets attribution_skill.

    Matches either:
    - exact namespaced match: "beads-tasks:beads-core" == "beads-tasks:beads-core"
    - stripped name match: "beads-core" == stripped("beads-tasks:beads-core")
    """
    if not skill_arg or not attribution_skill:
        return False
    if skill_arg == attribution_skill:
        return True
    stripped_attr = attribution_skill.split(":")[-1]
    stripped_arg = skill_arg.split(":")[-1] if ":" in skill_arg else skill_arg
    return stripped_arg == stripped_attr


def _contains_skill_invocation(content_blocks, attribution_skill):
    """Return True if content_blocks contains a Skill tool-use targeting attribution_skill."""
    for block in content_blocks:
        if not isinstance(block, dict):
            continue
        if block.get("type") == "tool_use" and block.get("name") == "Skill":
            skill_arg = block.get("input", {}).get("skill", "")
            if _skill_args_match(skill_arg, attribution_skill):
                return True
    return False


# ---------------------------------------------------------------------------
# Core parser: one JSONL file -> list of Episode objects
# ---------------------------------------------------------------------------

def parse_file(filepath, alias_to_canonical, max_slice_chars=2000):
    """Parse a single JSONL file and return (episodes, unmatched_plugins).

    episodes: list of Episode objects for plugins that resolve to known marketplace plugins.
    unmatched_plugins: dict mapping plugin_name -> episode_turn_count for plugins
        that were attributed but do NOT resolve to any known plugin.

    Only episodes whose attributionPlugin resolves (via alias_to_canonical)
    to a known marketplace plugin are kept in the episodes list.

    Walking strategy:
    - assistant records with attributionSkill start/continue an episode
    - user records, tool_results (inside user messages), and system events
      are assigned to the currently-open episode by position
    - When attributionSkill changes (or an assistant record without one
      appears), close the current episode and start a new one if the new
      skill is known
    """
    completed = []
    unmatched_plugins = defaultdict(int)  # plugin_name -> turn count
    current = None  # Episode | None
    prev_skill = None
    current_is_unmatched = False  # True when current episode's plugin is unmatched
    unmatched_skill = None        # skill name for current unmatched episode
    unmatched_plugin = None       # plugin name for current unmatched episode
    unmatched_turns = 0

    in_first_turn_of_episode = False
    # Track the last assistant message content blocks seen (for "immediately-preceding turn" check)
    last_asst_content_blocks = []  # list of content blocks from most-recent assistant turn

    session_id = os.path.splitext(os.path.basename(filepath))[0]
    # filepath should be used as-is for the source_file field (full path)

    for lineno, record in iter_records(filepath):
        rtype = record.get("type")

        if rtype == "assistant":
            skill = record.get("attributionSkill")
            plugin = record.get("attributionPlugin")

            if skill != prev_skill:
                # Close current matched episode
                if current is not None:
                    current.end_line = lineno - 1
                    completed.append(current)
                    current = None

                # Flush unmatched episode counter
                if current_is_unmatched and unmatched_plugin and unmatched_turns > 0:
                    unmatched_plugins[unmatched_plugin] += unmatched_turns
                    unmatched_turns = 0
                    unmatched_plugin = None
                    unmatched_skill = None
                current_is_unmatched = False

                # Determine canonical plugin for new skill
                canonical = None
                effective_plugin = plugin
                if plugin:
                    canonical = resolve_plugin(plugin, alias_to_canonical)
                elif skill:
                    # attribution_skill is namespaced: "plugin:skill" or bare "skill"
                    parts = skill.split(":")
                    if len(parts) >= 2:
                        effective_plugin = parts[0]
                        canonical = resolve_plugin(parts[0], alias_to_canonical)

                if skill and canonical:
                    # Known plugin — start a matched episode
                    ep_id = str(uuid.uuid4())
                    current = Episode(
                        episode_id=ep_id,
                        session_id=session_id,
                        source_file=filepath,
                        start_line=lineno,
                        attribution_skill=skill,
                        attribution_plugin=canonical,  # store canonical name
                    )
                    # Check for explicit trigger: did the immediately-preceding assistant
                    # turn (before this episode started) use the Skill tool for this skill?
                    if last_asst_content_blocks:
                        if _contains_skill_invocation(last_asst_content_blocks, skill):
                            current.trigger_type = "explicit"
                    in_first_turn_of_episode = True
                    current_is_unmatched = False
                elif skill:
                    # Unknown plugin — track for unmatched summary
                    current_is_unmatched = True
                    unmatched_plugin = effective_plugin or ""
                    unmatched_skill = skill
                    unmatched_turns = 0
                else:
                    current_is_unmatched = False

                prev_skill = skill

            # Count turns for unmatched episodes (for summary reporting)
            if current_is_unmatched:
                # Still update last_asst_content_blocks so subsequent skill checks work
                msg_content = record.get("message", {}).get("content", [])
                if isinstance(msg_content, list):
                    last_asst_content_blocks = msg_content
                unmatched_turns += 1
                continue

            if current is None:
                # Update last_asst_content_blocks even for untracked episodes
                msg_content = record.get("message", {}).get("content", [])
                if isinstance(msg_content, list):
                    last_asst_content_blocks = msg_content
                continue

            # Count this as a turn
            current.turn_count += 1
            current.end_line = lineno

            # Process all tool uses in this assistant turn
            msg_content = record.get("message", {}).get("content", [])
            if isinstance(msg_content, list):
                for block in msg_content:
                    if not isinstance(block, dict) or block.get("type") != "tool_use":
                        continue
                    tool_name = block.get("name", "")
                    # Check for explicit trigger (same-turn Skill call)
                    if tool_name == "Skill" and in_first_turn_of_episode:
                        skill_arg = block.get("input", {}).get("skill", "")
                        if _skill_args_match(skill_arg, current.attribution_skill):
                            current.trigger_type = "explicit"
                    # Count AskUserQuestion
                    if tool_name == "AskUserQuestion":
                        current.ask_user_questions += 1
                    # Record for retry detection
                    current.record_tool_call(tool_name, block.get("input", {}))

                last_asst_content_blocks = msg_content
            in_first_turn_of_episode = False

            # Outcome signals from assistant message text
            msg_str = json.dumps(record.get("message", {}))
            if COMMIT_RE.search(msg_str):
                current.ended_in_commit = True
            if PR_RE.search(msg_str):
                current.ended_in_pr = True

        elif rtype == "user":
            # Assign user messages to the currently-open matched episode
            if current is None:
                continue

            msg = record.get("message", {})
            content = msg.get("content", [])

            if isinstance(content, str):
                # Plain text prompt — check for user correction
                first_sentence = content.split(".")[0].split("!")[0].split("?")[0]
                if CORRECTION_RE.search(first_sentence):
                    current.user_corrections += 1
            elif isinstance(content, list):
                for block in content:
                    if not isinstance(block, dict):
                        continue
                    btype = block.get("type")

                    if btype == "tool_result":
                        # Error signal: is_error == True
                        if block.get("is_error") is True:
                            current.tool_errors += 1

                        # Permission denial: user rejected the tool use
                        block_content = block.get("content", "")
                        if isinstance(block_content, str):
                            if ("doesn't want to proceed" in block_content
                                    or "tool use was rejected" in block_content.lower()):
                                current.permission_denials += 1
                            # Outcome signals from tool output
                            if TEST_RUN_RE.search(block_content):
                                current.tests_run = True
                            if TEST_PASS_RE.search(block_content):
                                current.tests_passed = True

                        # Interruption signal: toolUseResult.interrupted == True
                        # Note: toolUseResult is at the top-level of the user record,
                        # not inside the block
                        tool_use_result = record.get("toolUseResult")
                        if isinstance(tool_use_result, dict) and tool_use_result.get("interrupted"):
                            current.interruptions += 1

                    elif btype == "text":
                        # Check for user correction in multi-part text block
                        text = block.get("text", "")
                        first_sentence = text.split(".")[0].split("!")[0].split("?")[0]
                        if CORRECTION_RE.search(first_sentence):
                            current.user_corrections += 1

        elif rtype == "system":
            # Assign system events to the currently-open matched episode by position
            if current is None:
                continue
            subtype = record.get("subtype", "")
            if subtype == "turn_duration":
                current.duration_ms += record.get("durationMs", 0)

    # Close the last open episode
    if current is not None:
        completed.append(current)

    # Flush any trailing unmatched episode
    if current_is_unmatched and unmatched_plugin and unmatched_turns > 0:
        unmatched_plugins[unmatched_plugin] += unmatched_turns

    return completed, dict(unmatched_plugins)


# ---------------------------------------------------------------------------
# Walk all project dirs
# ---------------------------------------------------------------------------

def walk_projects(projects_dir, alias_to_canonical, max_slice_chars=2000):
    """Walk all project subdirectories and parse every *.jsonl file.

    Yields (episode_or_none, unmatched_dict) tuples.
    Each JSONL file produces:
      - zero or more Episode objects (yielded with unmatched_dict={} per episode)
      - one final flush of unmatched_plugins per file (yielded as (None, unmatched_dict))
    """
    if not os.path.isdir(projects_dir):
        return

    for proj_name in sorted(os.listdir(projects_dir)):
        proj_dir = os.path.join(projects_dir, proj_name)
        if not os.path.isdir(proj_dir):
            continue
        for filename in sorted(os.listdir(proj_dir)):
            if not filename.endswith(".jsonl"):
                continue
            filepath = os.path.join(proj_dir, filename)
            try:
                episodes, unmatched = parse_file(filepath, alias_to_canonical, max_slice_chars)
                for ep in episodes:
                    yield ep, {}
                if unmatched:
                    yield None, unmatched
            except OSError:
                continue


# ---------------------------------------------------------------------------
# Episode slice writer
# ---------------------------------------------------------------------------

def write_episode_slice(ep, output_dir, max_slice_chars=2000):
    """Write a sanitized per-episode slice file."""
    slices_dir = os.path.join(output_dir, "episodes")
    os.makedirs(slices_dir, exist_ok=True)

    slug = re.sub(r"[^a-zA-Z0-9_-]", "_", ep.attribution_skill)[:40]
    filename = f"{slug}__{ep.episode_id[:8]}.json"
    filepath = os.path.join(slices_dir, filename)

    # Build a sanitized slice
    record = ep.to_summary_record()
    record["_note"] = "sanitized slice; raw content stripped"

    with open(filepath, "w", encoding="utf-8") as fh:
        json.dump(record, fh, indent=2)
        fh.write("\n")


# ---------------------------------------------------------------------------
# Aggregate and write outputs
# ---------------------------------------------------------------------------

def write_dataset(episodes, output_dir):
    """Write dataset.json with per-episode summary records."""
    os.makedirs(output_dir, exist_ok=True)
    path = os.path.join(output_dir, "dataset.json")
    records = [ep.to_summary_record() for ep in episodes]
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(records, fh, indent=2)
        fh.write("\n")
    return path


def write_summary(episodes, canonical_names, alias_to_canonical, output_dir,
                  extra_unmatched=None):
    """Write summary.md with per-skill aggregates and unmatched plugins.

    extra_unmatched: dict of {plugin_name: turn_count} for plugins attributed in
        transcripts but not resolving to any marketplace plugin (collected during scan).
    """
    os.makedirs(output_dir, exist_ok=True)
    path = os.path.join(output_dir, "summary.md")

    # Aggregate per skill
    skill_stats = defaultdict(lambda: {
        "count": 0,
        "total_turns": 0,
        "total_duration_ms": 0,
        "total_friction": 0.0,
        "total_tool_errors": 0,
        "total_interruptions": 0,
        "total_permission_denials": 0,
        "total_user_corrections": 0,
        "explicit_triggers": 0,
        "ambient_triggers": 0,
        "ended_in_commit": 0,
        "ended_in_pr": 0,
        "tests_run": 0,
        "tests_passed": 0,
    })

    for ep in episodes:
        key = SKILL_RENAME_ALIASES.get(ep.attribution_skill, ep.attribution_skill)
        stats = skill_stats[key]
        stats["count"] += 1
        stats["total_turns"] += ep.turn_count
        stats["total_duration_ms"] += ep.duration_ms
        stats["total_friction"] += ep.to_summary_record()["friction_score"]
        stats["total_tool_errors"] += ep.tool_errors
        stats["total_interruptions"] += ep.interruptions
        stats["total_permission_denials"] += ep.permission_denials
        stats["total_user_corrections"] += ep.user_corrections
        if ep.trigger_type == "explicit":
            stats["explicit_triggers"] += 1
        else:
            stats["ambient_triggers"] += 1
        if ep.ended_in_commit:
            stats["ended_in_commit"] += 1
        if ep.ended_in_pr:
            stats["ended_in_pr"] += 1
        if ep.tests_run:
            stats["tests_run"] += 1
        if ep.tests_passed:
            stats["tests_passed"] += 1

    # Unmatched plugins: came from the scan (plugins that never resolved)
    unmatched_plugins = dict(extra_unmatched) if extra_unmatched else {}

    lines = [
        "# Session Analysis Summary",
        "",
        f"Total episodes indexed: {len(episodes)}",
        "",
        "## Per-Skill Aggregates",
        "",
        "| Skill | Episodes | Avg Turns | Avg Duration (s) | Avg Friction | "
        "Errors | Interrupts | Explicit | Commits | PRs |",
        "|-------|----------|-----------|-----------------|--------------|"
        "--------|-----------|----------|---------|-----|",
    ]

    for skill in sorted(skill_stats):
        s = skill_stats[skill]
        n = s["count"]
        avg_turns = round(s["total_turns"] / n, 1) if n else 0
        avg_dur = round(s["total_duration_ms"] / n / 1000, 1) if n else 0
        avg_friction = round(s["total_friction"] / n, 3) if n else 0
        lines.append(
            f"| {skill} | {n} | {avg_turns} | {avg_dur} | {avg_friction} | "
            f"{s['total_tool_errors']} | {s['total_interruptions']} | "
            f"{s['explicit_triggers']} | {s['ended_in_commit']} | {s['ended_in_pr']} |"
        )

    lines += [
        "",
        "## Unmatched Attributed Plugins",
        "",
        "These plugin names appeared in attribution fields but do not match any",
        "current marketplace plugin (after rename aliases are applied).",
        "",
    ]

    if unmatched_plugins:
        lines += ["| Plugin | Episode Count |", "|--------|--------------|"]
        for name in sorted(unmatched_plugins):
            lines.append(f"| {name} | {unmatched_plugins[name]} |")
    else:
        lines.append("None — all attributed plugins resolved to current marketplace plugins.")

    lines.append("")

    with open(path, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines))
        fh.write("\n")

    return path


def select_slice_sample(episodes, rocky_n=5, random_n=5):
    """Select episodes for slice output: rockiest N + random baseline N.

    Returns a list of Episode objects (may overlap between the two groups).
    """
    if not episodes:
        return []

    scored = sorted(
        episodes,
        key=lambda e: e.to_summary_record()["friction_score"],
        reverse=True,
    )

    # Rocky = top N by friction score
    rocky = scored[:rocky_n]

    # Random baseline: pick evenly spaced from the rest
    rest = scored[rocky_n:]
    if rest:
        step = max(1, len(rest) // random_n)
        baseline = [rest[i] for i in range(0, len(rest), step)][:random_n]
    else:
        baseline = []

    seen_ids = set()
    result = []
    for ep in rocky + baseline:
        if ep.episode_id not in seen_ids:
            result.append(ep)
            seen_ids.add(ep.episode_id)

    return result


# ---------------------------------------------------------------------------
# Entry point helpers
# ---------------------------------------------------------------------------

def _find_repo_root(start):
    """Walk up from start looking for a .git directory."""
    candidate = os.path.abspath(start)
    while True:
        if os.path.isdir(os.path.join(candidate, ".git")):
            return candidate
        parent = os.path.dirname(candidate)
        if parent == candidate:
            return start
        candidate = parent


def _parse_args(argv):
    parsed = {
        "projects_dir": os.path.expanduser("~/.claude/projects"),
        "plugins_dir": None,       # resolved later relative to repo root
        "output_dir": None,        # resolved later
        "fixture": None,
        "max_slice_chars": 2000,
        "sample_rocky": 5,
        "sample_random": 5,
    }

    i = 0
    while i < len(argv):
        arg = argv[i]
        if arg == "--projects-dir":
            i += 1
            parsed["projects_dir"] = argv[i]
        elif arg == "--plugins-dir":
            i += 1
            parsed["plugins_dir"] = argv[i]
        elif arg == "--output-dir":
            i += 1
            parsed["output_dir"] = argv[i]
        elif arg == "--fixture":
            i += 1
            parsed["fixture"] = argv[i]
        elif arg == "--max-slice-chars":
            i += 1
            parsed["max_slice_chars"] = int(argv[i])
        elif arg == "--sample-rocky":
            i += 1
            parsed["sample_rocky"] = int(argv[i])
        elif arg == "--sample-random":
            i += 1
            parsed["sample_random"] = int(argv[i])
        elif arg in ("-h", "--help"):
            print(__doc__)
            sys.exit(0)
        else:
            print(f"Unknown argument: {arg}", file=sys.stderr)
            sys.exit(1)
        i += 1

    return parsed


def main():
    parsed = _parse_args(sys.argv[1:])

    repo_root = _find_repo_root(os.getcwd())

    if parsed["plugins_dir"] is None:
        parsed["plugins_dir"] = os.path.join(repo_root, "plugins")

    if parsed["output_dir"] is None:
        parsed["output_dir"] = os.path.join(os.getcwd(), "output", "session-analysis")

    plugins_dir = parsed["plugins_dir"]
    output_dir = parsed["output_dir"]
    max_slice_chars = parsed["max_slice_chars"]
    rocky_n = parsed["sample_rocky"]
    random_n = parsed["sample_random"]

    # Discover plugins
    canonical_names, alias_to_canonical = discover_plugins(plugins_dir)
    print(
        f"Discovered {len(canonical_names)} marketplace plugins: "
        f"{sorted(canonical_names)}"
    )
    print(f"Rename aliases: {RENAME_ALIASES}")

    # Collect all episodes
    all_episodes = []
    all_unmatched = defaultdict(int)  # plugin_name -> turn count across all files

    if parsed["fixture"]:
        # Single-file fixture mode
        fixture_path = os.path.abspath(parsed["fixture"])
        output_dir = os.path.join(output_dir, "fixture")
        print(f"Running fixture mode on: {fixture_path}")
        try:
            eps, unmatched = parse_file(fixture_path, alias_to_canonical, max_slice_chars)
            all_episodes.extend(eps)
            for k, v in unmatched.items():
                all_unmatched[k] += v
        except OSError as exc:
            print(f"Error reading fixture: {exc}", file=sys.stderr)
            sys.exit(1)
    else:
        # Full scan mode
        projects_dir = parsed["projects_dir"]
        print(f"Scanning projects under: {projects_dir}")
        for ep, unmatched in walk_projects(projects_dir, alias_to_canonical, max_slice_chars):
            if ep is not None:
                all_episodes.append(ep)
                # Print progress every 100 episodes
                if len(all_episodes) % 100 == 0:
                    print(f"  ... {len(all_episodes)} episodes so far")
            for k, v in unmatched.items():
                all_unmatched[k] += v
        print(f"Scan complete. Found {len(all_episodes)} episodes.")

    # Write outputs
    dataset_path = write_dataset(all_episodes, output_dir)
    print(f"Wrote: {dataset_path}")

    summary_path = write_summary(
        all_episodes, canonical_names, alias_to_canonical, output_dir,
        extra_unmatched=dict(all_unmatched),
    )
    print(f"Wrote: {summary_path}")

    # Select and write slices
    sample = select_slice_sample(all_episodes, rocky_n, random_n)
    slices_dir = os.path.join(output_dir, "episodes")
    for ep in sample:
        write_episode_slice(ep, output_dir, max_slice_chars)
    print(f"Wrote {len(sample)} episode slices to: {slices_dir}/")

    # Summary stats
    if all_episodes:
        total_friction = sum(e.to_summary_record()["friction_score"] for e in all_episodes)
        avg_friction = total_friction / len(all_episodes)
        skills_seen = {e.attribution_skill for e in all_episodes}
        print(
            f"\nEpisode stats: {len(all_episodes)} total, "
            f"{len(skills_seen)} distinct skills, "
            f"avg friction={avg_friction:.3f}"
        )
    else:
        print("\nNo episodes found (no matching attribution in scanned transcripts).")


if __name__ == "__main__":
    main()
