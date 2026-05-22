#!/usr/bin/env python3
"""check-fixture.py — Verify analyze-sessions.py output against expected fixture.

Usage:
    python3 scripts/fixtures/check-fixture.py \\
        --actual <output-dir>/fixture/dataset.json \\
        --expected scripts/fixtures/session-fixture-expected.json \\
        [--summary <output-dir>/fixture/summary.md]

Exits 0 if all checks pass, 1 if any fail.

What is checked:
    1. Episode count matches expected "episode_count"
    2. For each expected episode (order-independent, matched by attribution_skill):
       - All non-ID fields match exactly
    3. If --summary is provided:
       - Unmatched plugins appear in the summary.md text
"""

import json
import os
import sys


def load_json(path):
    try:
        with open(path, encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, json.JSONDecodeError) as exc:
        print(f"ERROR: cannot load {path}: {exc}", file=sys.stderr)
        sys.exit(1)


def _parse_args(argv):
    parsed = {"actual": None, "expected": None, "summary": None}
    i = 0
    while i < len(argv):
        arg = argv[i]
        if arg == "--actual":
            i += 1
            parsed["actual"] = argv[i]
        elif arg == "--expected":
            i += 1
            parsed["expected"] = argv[i]
        elif arg == "--summary":
            i += 1
            parsed["summary"] = argv[i]
        else:
            print(f"Unknown argument: {arg}", file=sys.stderr)
            sys.exit(1)
        i += 1
    return parsed


SKIP_FIELDS = {"episode_id", "_description", "_friction_breakdown", "_notes", "_design_notes"}

FIELDS_TO_CHECK = [
    "attribution_skill", "attribution_plugin", "trigger_type",
    "turn_count", "tool_errors", "user_corrections", "retries",
    "permission_denials", "interruptions", "duration_ms",
    "ended_in_commit", "ended_in_pr", "friction_score",
]


def main():
    parsed = _parse_args(sys.argv[1:])

    if not parsed["actual"] or not parsed["expected"]:
        print("Usage: check-fixture.py --actual <dataset.json> --expected <expected.json>",
              file=sys.stderr)
        sys.exit(1)

    actual = load_json(parsed["actual"])  # list of episode dicts
    expected = load_json(parsed["expected"])  # dict with episode_count, episodes, unmatched_plugins

    failures = []

    # Check 1: episode count
    actual_count = len(actual)
    expected_count = expected.get("episode_count")
    if actual_count != expected_count:
        failures.append(
            f"Episode count: expected {expected_count}, got {actual_count}"
        )

    # Build lookup: attribution_skill -> actual episode record
    actual_by_skill = {}
    for ep in actual:
        skill = ep.get("attribution_skill", "")
        actual_by_skill[skill] = ep

    # Check 2: per-episode fields
    for exp_ep in expected.get("episodes", []):
        skill = exp_ep.get("attribution_skill")
        if skill not in actual_by_skill:
            failures.append(
                f"Episode for skill '{skill}' not found in actual output"
            )
            continue
        act_ep = actual_by_skill[skill]
        for field in FIELDS_TO_CHECK:
            if field not in exp_ep:
                continue
            exp_val = exp_ep[field]
            act_val = act_ep.get(field)
            if act_val != exp_val:
                failures.append(
                    f"Episode '{skill}': field '{field}' expected {exp_val!r}, got {act_val!r}"
                )

    # Check 3: unmatched plugins in summary.md (if provided)
    if parsed["summary"]:
        try:
            with open(parsed["summary"], encoding="utf-8") as fh:
                summary_text = fh.read()
        except OSError as exc:
            failures.append(f"Cannot read summary.md: {exc}")
            summary_text = ""

        expected_unmatched = expected.get("unmatched_plugins", {})
        for plugin_name in expected_unmatched:
            if plugin_name not in summary_text:
                failures.append(
                    f"Unmatched plugin '{plugin_name}' not found in summary.md"
                )

    # Report
    if failures:
        print(f"FIXTURE CHECK FAILED ({len(failures)} failure(s)):")
        for f in failures:
            print(f"  FAIL: {f}")
        sys.exit(1)
    else:
        print(f"FIXTURE CHECK PASSED: {actual_count} episodes verified.")
        sys.exit(0)


if __name__ == "__main__":
    main()
