#!/usr/bin/env python3
"""analyze-sessions.py — Offline session-transcript indexer for Claude Code skill episodes.

Scans Claude Code session transcripts under ~/.claude/projects/*/*.jsonl,
identifies per-skill "episodes", and emits friction/outcome scoring to
output/session-analysis/.

Usage:
    python3 scripts/analyze-sessions.py [options]

Run with --help for the option list (--projects-dir, --plugins-dir,
--output-dir, --fixture, --max-slice-chars, --sample-rocky, --sample-baseline).

Outputs (under output-dir/):
    dataset.json         Per-episode summary records (no raw message content)
    summary.md           Per-skill aggregates + unmatched plugins
    episodes/            Sanitized per-episode slice files

Stdlib only. Streams files line-by-line; never loads a whole file into memory.
"""

import argparse
import json
import os
import re
import sys
import uuid
from collections import defaultdict

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

RENAME_ALIASES = {
    "html-ask": "html-visualization",
    # Plugin renamed whole (grill -> challenge, when kiss and are-you-sure joined it).
    "grill": "challenge",
    # These plugins were folded, whole, into a single current plugin.
    # complexity-review's one skill went project-review -> challenge:kiss, so its
    # bare-skill episodes now belong to challenge, not project-review.
    "complexity-review": "challenge",
    "project-ops": "project-execute",
    "project-docs": "project-review",
    # Deliberately absent:
    #   "project-quality" — it was SPLIT (exec/explain skills -> project-execute, review
    #     skills -> project-review). Which half an episode belongs to depends on its skill,
    #     not its plugin, so no plugin->plugin entry can be right. canonical_plugin() below
    #     resolves a namespaced skill through SKILL_RENAME_ALIASES and takes the plugin from
    #     the canonical skill's prefix, which does express the split.
    #   "project-review" — it is a live plugin directory again. discover_plugins() writes
    #     identity mappings after this dict, so an entry here would be silently overwritten;
    #     listing it would only mislead a future reader.
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
    # project-docs skills -> consolidated into the read-only docs audit
    "project-docs:coder-docs": "project-review:project-review-docs",
    "project-docs:create-docs": "project-review:project-review-docs",
    "project-docs:improve-doc": "project-review:project-review-docs",
    "project-docs:project-improve-doc": "project-review:project-review-docs",
    "project-docs:init-or-update-docs": "project-review:project-review-docs",
    "project-docs:review-docs": "project-review:project-review-docs",
    "project-docs:revise-docs": "project-review:project-review-docs",
    "project-docs:project-docs": "project-review:project-review-docs",
    "project-docs:project-create-docs": "project-review:project-review-docs",
    "project-docs:project-improve-docs": "project-review:project-review-docs",
    "project-docs:project-init-or-update-docs": "project-review:project-review-docs",
    "project-docs:project-review-docs": "project-review:project-review-docs",
    "project-docs:project-revise-docs": "project-review:project-review-docs",
    # project-ops skills -> the project-exec-* family (testing / releasing / monitoring)
    "project-ops:analyze-monitoring-data": "project-execute:project-exec-monitoring",
    "project-ops:executes-tests": "project-execute:project-exec-testing",
    "project-ops:project-executes-tests": "project-execute:project-exec-testing",
    "project-ops:trigger-release": "project-execute:project-exec-releasing",
    "project-ops:project-analyze-monitoring-data": "project-execute:project-exec-monitoring",
    "project-ops:project-run-tests": "project-execute:project-exec-testing",
    "project-ops:project-trigger-release": "project-execute:project-exec-releasing",
    # project-quality ops renamed to the project-exec-* family
    "project-quality:project-run-tests": "project-execute:project-exec-testing",
    "project-quality:project-trigger-release": "project-execute:project-exec-releasing",
    "project-quality:project-analyze-monitoring": "project-execute:project-exec-monitoring",
    # project-quality era: the plugin was split into project-execute + project-review.
    # These are the skill names as they appeared while project-quality existed.
    "project-quality:project-exec-testing": "project-execute:project-exec-testing",
    "project-quality:project-exec-releasing": "project-execute:project-exec-releasing",
    "project-quality:project-exec-monitoring": "project-execute:project-exec-monitoring",
    "project-quality:project-explain": "project-execute:project-explain",
    # project-review-all was removed; the old umbrella episodes keep its retired name so
    # they group together and attribute to the live project-review plugin (resolved by
    # prefix), rather than being mismerged into a surviving single-dimension skill.
    "project-quality:project-review": "project-review:project-review-all",
    "project-quality:project-review-complexity": "challenge:kiss",
    "project-quality:project-review-consistency": "project-review:project-review-consistency",
    "project-quality:project-review-structure": "project-review:project-review-structure",
    "project-quality:project-review-tests": "project-review:project-review-tests",
    "project-quality:project-review-docs": "project-review:project-review-docs",
    # complexity-review plugin era (plugin later renamed; the skill now lives in challenge)
    "complexity-review:complexity-review": "challenge:kiss",
    # first project-review era (the test -> tests rename happened in the project-quality merge).
    # Only keys that are NOT current skill names may appear here: project-review is a live
    # plugin again, so an entry keyed on a live "project-review:project-review-*" name would
    # rewrite present-day episodes onto a dead row.
    "project-review:complexity-review": "challenge:kiss",
    "project-review:consistency-review": "project-review:project-review-consistency",
    "project-review:structure-review": "project-review:project-review-structure",
    "project-review:test-review": "project-review:project-review-tests",
    "project-review:project-review-test": "project-review:project-review-tests",
    # project-explore skill renamed (explore-project -> project-explore)
    "project-explore:explore-project": "project-explore:project-explore",
    # grill extracted from project-quality into its own standalone plugin, which was
    # then renamed grill -> challenge. Values are the current canonical name, not a
    # chain: the map is applied once, never transitively.
    "project-quality:project-review-grill": "challenge:grill",
    "grill:grill": "challenge:grill",
    # complexity left project-review entirely — it is now the on-demand challenge:kiss.
    # Safe to key on the old name: project-review-complexity is no longer a live skill.
    "project-review:project-review-complexity": "challenge:kiss",
    # github-releases: stale "release" skill name -> the plugin's actual skill
    "github-releases:release": "github-releases:github-releases",
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

# Harness-generated content blocks inside user messages. These are not user
# prose, so they must be stripped before scanning for user_corrections —
# otherwise slash-command bodies like /goal with args "do not stop until..."
# fire false positives on the correction regex.
HARNESS_BLOCK_RE = re.compile(
    r"<(command-name|command-message|command-args|local-command-stdout|"
    r"local-command-stderr|bash-stdout|bash-stderr|system-reminder|attachment)>"
    r".*?</\1>",
    re.DOTALL | re.IGNORECASE,
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
    r"\b(pytest|npm test|go test|cargo test|make test|mise r(un)? test|\.\/test)\b",
    re.IGNORECASE,
)
TEST_PASS_RE = re.compile(
    r"\b(all tests pass(ed)?|test(s)? pass(ed)?|ok\b.*test|PASSED)\b",
    re.IGNORECASE,
)

# Cancelled siblings of a parallel tool batch. When the user interrupts a
# parallel tool call, the un-run siblings come back as is_error tool_results
# carrying this phrase. They are user-initiated cancellations, not tool
# failures, so they must not be counted as tool_errors (weighted 3.0).
CANCELLED_PARALLEL_RE = re.compile(r"cancelled:\s*parallel tool call", re.IGNORECASE)

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


def discover_skill_modes(plugins_dir):
    """Return {canonical_skill: invocation_mode} parsed from each SKILL.md frontmatter.

    Mode is one of:
      - 'user-only': user-invocable AND disable-model-invocation=true.
        Reachable only via slash command; the Skill tool cannot invoke it.
      - 'library':   user-invocable=false. Reachable only by other skills
        loading it via the Skill tool; not user-invocable.
      - 'both':      neither flag set. User can slash-invoke AND the model
        can invoke via the Skill tool.

    Surfacing this next to the trigger column prevents misreading a
    structural 0% Model-invoked rate as a measurement gap.
    """
    modes = {}
    if not os.path.isdir(plugins_dir):
        return modes
    for plugin_name in sorted(os.listdir(plugins_dir)):
        skills_dir = os.path.join(plugins_dir, plugin_name, "skills")
        if not os.path.isdir(skills_dir):
            continue
        for skill_name in sorted(os.listdir(skills_dir)):
            skill_md = os.path.join(skills_dir, skill_name, "SKILL.md")
            if not os.path.isfile(skill_md):
                continue
            user_inv = None
            disable_mod = None
            try:
                with open(skill_md, encoding="utf-8", errors="replace") as fh:
                    in_fm = False
                    for line in fh:
                        stripped = line.rstrip()
                        if stripped == "---":
                            if not in_fm:
                                in_fm = True
                                continue
                            break
                        if in_fm:
                            if stripped.startswith("user-invocable:"):
                                user_inv = stripped.split(":", 1)[1].strip()
                            elif stripped.startswith("disable-model-invocation:"):
                                disable_mod = stripped.split(":", 1)[1].strip()
            except OSError:
                continue
            if user_inv == "false":
                mode = "library"
            elif disable_mod == "true":
                mode = "user-only"
            else:
                mode = "both"
            modes[f"{plugin_name}:{skill_name}"] = mode
    return modes


def resolve_plugin(plugin_name, alias_to_canonical):
    """Resolve a plugin name to its canonical name, or None if unknown."""
    return alias_to_canonical.get(plugin_name)


def canonical_plugin(skill, plugin, alias_to_canonical):
    """Resolve an episode's (skill, plugin) pair to (canonical_plugin, effective_plugin).

    The skill is authoritative when it is namespaced, because a plugin that was *split*
    (project-quality -> project-execute + project-review) cannot be resolved from its
    plugin name alone: project-quality:project-exec-testing and
    project-quality:project-review-docs came from one plugin and land in different ones.
    SKILL_RENAME_ALIASES already records which current skill each historical skill became,
    and its values are canonical "plugin:skill" pairs, so the prefix of the aliased skill
    is the canonical plugin.

    Falls back to the plugin-level alias when the skill is bare (not namespaced), which is
    all a folded — as opposed to split — plugin ever needs.

    Returns (None, effective_plugin) when the plugin is unknown, so the caller can count
    the episode as unmatched.
    """
    if skill:
        parts = SKILL_RENAME_ALIASES.get(skill, skill).split(":")
        if len(parts) >= 2:
            return resolve_plugin(parts[0], alias_to_canonical), parts[0]
    if plugin:
        return resolve_plugin(plugin, alias_to_canonical), plugin
    return None, plugin


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

    @property
    def friction_score(self):
        """Normalized friction score (0=smooth, higher=rockier)."""
        return self._compute_friction()

    def to_summary_record(self):
        """Return a JSON-serializable summary dict (no raw content)."""
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
            "friction_score": self.friction_score,
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


def _tool_result_text(content):
    """Flatten a tool_result 'content' value (str or list of blocks) to text.

    Tool results carry content either as a plain string or as a list of
    typed blocks (e.g. [{"type": "text", "text": "..."}]). Return a single
    string so detectors can scan it uniformly.
    """
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for item in content:
            if isinstance(item, dict) and isinstance(item.get("text"), str):
                parts.append(item["text"])
            elif isinstance(item, str):
                parts.append(item)
        return "\n".join(parts)
    return ""


# ---------------------------------------------------------------------------
# Trigger detection helpers
# ---------------------------------------------------------------------------

def _skill_args_match(skill_arg, attribution_skill):
    """Return True if skill_arg (from Skill tool input) targets attribution_skill.

    Matches either:
    - exact namespaced match: "tasks:tasks" == "tasks:tasks"
    - stripped name match: "tasks" == stripped("tasks:tasks")
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

def parse_file(filepath, alias_to_canonical):
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
                current_is_unmatched = False

                # Determine canonical plugin for new skill. attribution_skill is either
                # namespaced ("plugin:skill") or bare ("skill"); see canonical_plugin.
                canonical, effective_plugin = canonical_plugin(
                    skill, plugin, alias_to_canonical
                )

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
                # Plain text prompt — check for user correction.
                # Strip harness-generated blocks (slash-command echoes, etc.)
                # before regex so they don't fire false positives.
                prose = HARNESS_BLOCK_RE.sub("", content)
                first_sentence = prose.split(".")[0].split("!")[0].split("?")[0]
                if CORRECTION_RE.search(first_sentence):
                    current.user_corrections += 1
            elif isinstance(content, list):
                for block in content:
                    if not isinstance(block, dict):
                        continue
                    btype = block.get("type")

                    if btype == "tool_result":
                        block_content = block.get("content", "")
                        is_error = block.get("is_error") is True
                        # Error signal: is_error == True, EXCEPT cancelled siblings
                        # of a parallel tool batch. When a user interrupts a parallel
                        # call, the un-run siblings return is_error results carrying
                        # "Cancelled: parallel tool call" — those are cancellations,
                        # not tool failures, so counting them inflates tool_errors.
                        if is_error and not CANCELLED_PARALLEL_RE.search(
                                _tool_result_text(block_content)):
                            current.tool_errors += 1

                        # Permission denial: user rejected the tool use.
                        # Guard with is_error == True to avoid false positives when
                        # file content read by the model happens to contain the phrase
                        # (e.g. docs/MONITORING.md describes the detector strings).
                        if (isinstance(block_content, str)
                                and is_error
                                and ("doesn't want to proceed" in block_content
                                     or "tool use was rejected" in block_content.lower())):
                            current.permission_denials += 1
                        # Outcome signals from tool output
                        if isinstance(block_content, str):
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
                        # Check for user correction in multi-part text block.
                        # Strip harness-generated blocks first.
                        text = block.get("text", "")
                        prose = HARNESS_BLOCK_RE.sub("", text)
                        first_sentence = prose.split(".")[0].split("!")[0].split("?")[0]
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

def walk_projects(projects_dir, alias_to_canonical):
    """Walk all project subdirectories and parse every *.jsonl file.

    Yields one (episodes, unmatched_plugins) pair per parsed file, exactly as
    returned by parse_file. Unreadable files are skipped.
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
                yield parse_file(filepath, alias_to_canonical)
            except OSError:
                continue


# ---------------------------------------------------------------------------
# Episode slice writer
# ---------------------------------------------------------------------------

def _extract_slice_events(source_file, start_line, end_line, max_slice_chars):
    """Reconstruct sanitized conversation events for one episode's line range.

    Re-reads source_file (only called for the small sampled subset of episodes,
    so the re-read cost is negligible) and returns an ordered list of event
    dicts the Phase 2 judge can read: assistant turns (text + tool names), user
    prompts, and tool results (with an is_error flag). All text is run through
    sanitize_text — credential-like strings and long hex are redacted and each
    field is capped at max_slice_chars.
    """
    events = []
    try:
        for lineno, record in iter_records(source_file):
            if lineno < start_line:
                continue
            if lineno > end_line:
                break
            rtype = record.get("type")
            content = record.get("message", {}).get("content", [])

            if rtype == "assistant":
                if not isinstance(content, list):
                    continue
                text_parts, tools = [], []
                for block in content:
                    if not isinstance(block, dict):
                        continue
                    if block.get("type") == "text":
                        text_parts.append(block.get("text", ""))
                    elif block.get("type") == "tool_use":
                        tools.append(block.get("name", ""))
                event = {"line": lineno, "role": "assistant"}
                if text_parts:
                    event["text"] = sanitize_text("\n".join(text_parts), max_slice_chars)
                if tools:
                    event["tools"] = tools
                events.append(event)

            elif rtype == "user":
                if isinstance(content, str):
                    events.append({
                        "line": lineno, "role": "user",
                        "text": sanitize_text(content, max_slice_chars),
                    })
                elif isinstance(content, list):
                    for block in content:
                        if not isinstance(block, dict):
                            continue
                        btype = block.get("type")
                        if btype == "text":
                            events.append({
                                "line": lineno, "role": "user",
                                "text": sanitize_text(block.get("text", ""), max_slice_chars),
                            })
                        elif btype == "tool_result":
                            event = {
                                "line": lineno, "role": "tool_result",
                                "text": sanitize_text(
                                    _tool_result_text(block.get("content", "")),
                                    max_slice_chars),
                            }
                            if block.get("is_error") is True:
                                event["is_error"] = True
                            events.append(event)
    except OSError:
        pass
    return events


def write_episode_slice(ep, output_dir, max_slice_chars=2000):
    """Write a sanitized per-episode slice file with reconstructed content."""
    slices_dir = os.path.join(output_dir, "episodes")
    os.makedirs(slices_dir, exist_ok=True)

    slug = re.sub(r"[^a-zA-Z0-9_-]", "_", ep.attribution_skill)[:40]
    filename = f"{slug}__{ep.episode_id[:8]}.json"
    filepath = os.path.join(slices_dir, filename)

    # Build a sanitized slice: summary fields + the episode's conversation
    # events so the Phase 2 judge has real content to read (not just stats).
    record = ep.to_summary_record()
    record["events"] = _extract_slice_events(
        ep.source_file, ep.start_line, ep.end_line, max_slice_chars)
    record["_note"] = (
        "sanitized slice; credential-like strings and long hex redacted, "
        f"each event text capped at {max_slice_chars} chars"
    )

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


def write_summary(episodes, output_dir, extra_unmatched=None, skill_modes=None):
    """Write summary.md with per-skill aggregates and unmatched plugins.

    extra_unmatched: dict of {plugin_name: turn_count} for plugins attributed in
        transcripts but not resolving to any marketplace plugin (collected during scan).
    skill_modes: dict of {canonical_skill: 'user-only'|'library'|'both'} parsed
        from SKILL.md frontmatter. Determines whether the Model-invoked column
        is meaningful: 'user-only' skills cannot be model-invoked at all, so
        a 0 there is by-design, not a measurement gap.
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
        stats["total_friction"] += ep.friction_score
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

    skill_modes = skill_modes or {}

    lines = [
        "# Session Analysis Summary",
        "",
        f"Total episodes indexed: {len(episodes)}",
        "",
        "## Per-Skill Aggregates",
        "",
        "Mode column reflects SKILL.md frontmatter. `user-only` skills cannot be",
        "model-invoked at all (Model-invoked=0 is by design, not a gap). `library`",
        "skills are loaded by other skills via the Skill tool. `both` skills can be",
        "reached either way.",
        "",
        "| Skill | Mode | Episodes | Avg Turns | Avg Duration (s) | Avg Friction | "
        "Errors | Interrupts | Model-invoked | Commits | PRs |",
        "|-------|------|----------|-----------|-----------------|--------------|"
        "--------|-----------|---------------|---------|-----|",
    ]

    for skill in sorted(skill_stats):
        s = skill_stats[skill]
        n = s["count"]
        avg_turns = round(s["total_turns"] / n, 1) if n else 0
        avg_dur = round(s["total_duration_ms"] / n / 1000, 1) if n else 0
        avg_friction = round(s["total_friction"] / n, 3) if n else 0
        mode = skill_modes.get(skill, "?")
        lines.append(
            f"| {skill} | {mode} | {n} | {avg_turns} | {avg_dur} | {avg_friction} | "
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


def select_slice_sample(episodes, rocky_n=5, baseline_n=5):
    """Select episodes for slice output: rockiest N + evenly-spaced baseline N.

    The baseline is deterministic by design: an evenly-spaced stride over the
    friction-sorted remainder, so membership is a pure function of the
    friction ordering (no randomness). Returns a list of Episode objects.
    """
    if not episodes:
        return []

    scored = sorted(episodes, key=lambda e: e.friction_score, reverse=True)

    # Rocky = top N by friction score
    rocky = scored[:rocky_n]

    # Baseline: evenly-spaced stride over the remaining episodes
    rest = scored[rocky_n:]
    if rest:
        step = max(1, len(rest) // baseline_n)
        baseline = [rest[i] for i in range(0, len(rest), step)][:baseline_n]
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

# This script lives in <repo-root>/scripts/, so the repo root is one level up.
_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.realpath(__file__)))


def _parse_args(argv):
    parser = argparse.ArgumentParser(
        description="Offline session-transcript indexer for Claude Code skill episodes.",
    )
    parser.add_argument(
        "--projects-dir", default=os.path.expanduser("~/.claude/projects"),
        help="root directory containing project subdirs (default: ~/.claude/projects)")
    parser.add_argument(
        "--plugins-dir", default=os.path.join(_REPO_ROOT, "plugins"),
        help="root of the marketplace plugins directory (default: <repo-root>/plugins)")
    parser.add_argument(
        "--output-dir", default=os.path.join(os.getcwd(), "output", "session-analysis"),
        help="directory for output files (default: <cwd>/output/session-analysis)")
    parser.add_argument(
        "--fixture", default=None,
        help="run against a single JSONL fixture file; output goes to <output-dir>/fixture/")
    parser.add_argument(
        "--max-slice-chars", type=int, default=2000,
        help="max characters kept per event text in episode slices (default: 2000)")
    parser.add_argument(
        "--sample-rocky", type=int, default=5,
        help="how many rockiest episodes to include in the slices sample (default: 5)")
    parser.add_argument(
        "--sample-baseline", type=int, default=5,
        help="how many evenly-spaced baseline episodes in the slices sample (default: 5)")
    return parser.parse_args(argv)


def main():
    args = _parse_args(sys.argv[1:])

    plugins_dir = args.plugins_dir
    output_dir = args.output_dir
    max_slice_chars = args.max_slice_chars
    rocky_n = args.sample_rocky
    baseline_n = args.sample_baseline

    # Discover plugins
    canonical_names, alias_to_canonical = discover_plugins(plugins_dir)
    skill_modes = discover_skill_modes(plugins_dir)
    print(
        f"Discovered {len(canonical_names)} marketplace plugins: "
        f"{sorted(canonical_names)}"
    )
    print(f"Rename aliases: {RENAME_ALIASES}")

    # Collect all episodes
    all_episodes = []
    all_unmatched = defaultdict(int)  # plugin_name -> turn count across all files

    if args.fixture:
        # Single-file fixture mode
        fixture_path = os.path.abspath(args.fixture)
        output_dir = os.path.join(output_dir, "fixture")
        print(f"Running fixture mode on: {fixture_path}")
        try:
            eps, unmatched = parse_file(fixture_path, alias_to_canonical)
            all_episodes.extend(eps)
            for k, v in unmatched.items():
                all_unmatched[k] += v
        except OSError as exc:
            print(f"Error reading fixture: {exc}", file=sys.stderr)
            sys.exit(1)
    else:
        # Full scan mode
        projects_dir = args.projects_dir
        print(f"Scanning projects under: {projects_dir}")
        for episodes, unmatched in walk_projects(projects_dir, alias_to_canonical):
            before = len(all_episodes)
            all_episodes.extend(episodes)
            # Print progress roughly every 100 episodes
            if len(all_episodes) // 100 > before // 100:
                print(f"  ... {len(all_episodes)} episodes so far")
            for k, v in unmatched.items():
                all_unmatched[k] += v
        print(f"Scan complete. Found {len(all_episodes)} episodes.")

    # Write outputs
    dataset_path = write_dataset(all_episodes, output_dir)
    print(f"Wrote: {dataset_path}")

    summary_path = write_summary(
        all_episodes, output_dir,
        extra_unmatched=dict(all_unmatched),
        skill_modes=skill_modes,
    )
    print(f"Wrote: {summary_path}")

    # Select and write slices
    sample = select_slice_sample(all_episodes, rocky_n, baseline_n)
    slices_dir = os.path.join(output_dir, "episodes")
    expected_slices = set()
    for ep in sample:
        slug = re.sub(r"[^a-zA-Z0-9_-]", "_", ep.attribution_skill)[:40]
        expected_slices.add(f"{slug}__{ep.episode_id[:8]}.json")
        write_episode_slice(ep, output_dir, max_slice_chars)
    print(f"Wrote {len(sample)} episode slices to: {slices_dir}/")

    # Reconcile episodes/ against this run: remove only files the script itself
    # could have produced (matching our slug__8hexchars.json pattern) that aren't
    # in this run's output set — leaves user-saved files untouched.
    _slice_pattern = re.compile(r'^[A-Za-z0-9_-]{1,40}__[0-9a-f]{8}\.json$')
    if os.path.isdir(slices_dir):
        for entry in os.listdir(slices_dir):
            if _slice_pattern.match(entry) and entry not in expected_slices:
                os.remove(os.path.join(slices_dir, entry))

    # Summary stats
    if all_episodes:
        total_friction = sum(e.friction_score for e in all_episodes)
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
