#!/usr/bin/env python3
"""inventory.py — structured doc inventory for a project repo.

Usage:
    inventory.py <repo-root>
    inventory.py <repo-root> --format=text

Exits 0 on success; exits 1 on bad invocation.
"""

import json
import os
import sys

# ---------------------------------------------------------------------------
# Canonical doc set
# ---------------------------------------------------------------------------

CANONICAL_ROOT = ["README.md", "AGENTS.md", "CLAUDE.md"]

CANONICAL_DOCS = [
    "OVERVIEW.md",
    "CODING.md",
    "TESTING.md",
    "RELEASING.md",
    "MONITORING.md",
    "CHANGE-WORKFLOW.md",
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def count_lines(path):
    """Return (lines, non_heading_lines) for a markdown file.

    lines           — total line count (including blank lines)
    non_heading_lines — non-blank lines whose stripped form does NOT start with '#'
    """
    try:
        with open(path, encoding="utf-8", errors="replace") as fh:
            all_lines = fh.readlines()
    except OSError:
        return None, None

    lines = len(all_lines)
    non_heading_lines = sum(
        1
        for ln in all_lines
        if ln.strip() and not ln.strip().startswith("#")
    )
    return lines, non_heading_lines


# ---------------------------------------------------------------------------
# Core inventory logic
# ---------------------------------------------------------------------------

def inventory(repo_root):
    """Build and return the full inventory dict for *repo_root*."""

    # ── canonical root docs ─────────────────────────────────────────────────

    canonical = {}
    for name in CANONICAL_ROOT:
        path = os.path.join(repo_root, name)
        present = os.path.isfile(path)
        if present:
            rel = name  # root-relative
            lines, nhl = count_lines(path)
        else:
            rel = None
            lines = None
            nhl = None
        canonical[name] = {
            "present": present,
            "path": rel,
            "lines": lines,
            "non_heading_lines": nhl,
        }

    # ── canonical docs/ docs ────────────────────────────────────────────────

    for name in CANONICAL_DOCS:
        path = os.path.join(repo_root, "docs", name)
        present = os.path.isfile(path)
        if present:
            rel = os.path.join("docs", name)
            lines, nhl = count_lines(path)
        else:
            rel = None
            lines = None
            nhl = None
        canonical[name] = {
            "present": present,
            "path": rel,
            "lines": lines,
            "non_heading_lines": nhl,
        }

    # ── walk docs/ non-recursively ──────────────────────────────────────────

    docs_dir = os.path.join(repo_root, "docs")
    non_canonical_docs = []
    non_canonical_subdirs = []

    if os.path.isdir(docs_dir):
        with os.scandir(docs_dir) as it:
            for entry in sorted(it, key=lambda e: e.name):
                if entry.is_dir(follow_symlinks=False):
                    non_canonical_subdirs.append(
                        os.path.join("docs", entry.name) + "/"
                    )
                elif entry.is_file(follow_symlinks=False) and entry.name.endswith(".md"):
                    if entry.name not in CANONICAL_DOCS:
                        lines, nhl = count_lines(entry.path)
                        non_canonical_docs.append({
                            "path": os.path.join("docs", entry.name),
                            "lines": lines,
                            "non_heading_lines": nhl,
                        })

    # ── location violations ──────────────────────────────────────────────────
    # Canonical docs/ files found at the repo root (or vice-versa).

    location_violations = []

    for name in CANONICAL_DOCS:
        wrong_path = os.path.join(repo_root, name)
        if os.path.isfile(wrong_path):
            location_violations.append({
                "file": name,
                "found_at": name,
                "expected_at": os.path.join("docs", name),
            })

    for name in CANONICAL_ROOT:
        wrong_path = os.path.join(repo_root, "docs", name)
        if os.path.isfile(wrong_path):
            location_violations.append({
                "file": name,
                "found_at": os.path.join("docs", name),
                "expected_at": name,
            })

    # ── summary ─────────────────────────────────────────────────────────────

    canonical_present = sum(1 for v in canonical.values() if v["present"])
    canonical_missing = len(canonical) - canonical_present

    summary = {
        "canonical_present": canonical_present,
        "canonical_missing": canonical_missing,
        "non_canonical_count": len(non_canonical_docs),
        "non_canonical_subdir_count": len(non_canonical_subdirs),
        "violation_count": len(location_violations),
    }

    return {
        "canonical": canonical,
        "non_canonical_docs": non_canonical_docs,
        "non_canonical_subdirs": non_canonical_subdirs,
        "location_violations": location_violations,
        "summary": summary,
    }


# ---------------------------------------------------------------------------
# Text formatter
# ---------------------------------------------------------------------------

def _fmt_doc(name, entry):
    status = "present" if entry["present"] else "MISSING"
    if entry["present"]:
        return (
            f"  {name}: {status}  "
            f"lines={entry['lines']}  non_heading_lines={entry['non_heading_lines']}"
        )
    return f"  {name}: {status}"


def format_text(data):
    lines = []

    lines.append("=== Canonical docs ===")
    for name, entry in data["canonical"].items():
        lines.append(_fmt_doc(name, entry))

    lines.append("")
    lines.append("=== Non-canonical docs/ files ===")
    if data["non_canonical_docs"]:
        for entry in data["non_canonical_docs"]:
            lines.append(
                f"  {entry['path']}  "
                f"lines={entry['lines']}  non_heading_lines={entry['non_heading_lines']}"
            )
    else:
        lines.append("  (none)")

    lines.append("")
    lines.append("=== Non-canonical subdirs under docs/ ===")
    if data["non_canonical_subdirs"]:
        for subdir in data["non_canonical_subdirs"]:
            lines.append(f"  {subdir}")
    else:
        lines.append("  (none)")

    lines.append("")
    lines.append("=== Location violations ===")
    if data["location_violations"]:
        for v in data["location_violations"]:
            lines.append(
                f"  {v['file']}: found at {v['found_at']}, expected at {v['expected_at']}"
            )
    else:
        lines.append("  (none)")

    lines.append("")
    lines.append("=== Summary ===")
    s = data["summary"]
    lines.append(f"  canonical_present:         {s['canonical_present']}")
    lines.append(f"  canonical_missing:          {s['canonical_missing']}")
    lines.append(f"  non_canonical_count:        {s['non_canonical_count']}")
    lines.append(f"  non_canonical_subdir_count: {s['non_canonical_subdir_count']}")
    lines.append(f"  violation_count:            {s['violation_count']}")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main():
    args = sys.argv[1:]
    fmt = "json"

    positional = []
    for arg in args:
        if arg.startswith("--format="):
            fmt = arg.split("=", 1)[1]
        elif arg.startswith("--"):
            print(f"Unknown option: {arg}", file=sys.stderr)
            sys.exit(1)
        else:
            positional.append(arg)

    if not positional:
        print(f"Usage: {os.path.basename(sys.argv[0])} <repo-root> [--format=json|text]",
              file=sys.stderr)
        sys.exit(1)

    repo_root = positional[0]

    if not os.path.isdir(repo_root):
        print(f"Error: {repo_root!r} is not a directory", file=sys.stderr)
        sys.exit(1)

    data = inventory(repo_root)

    if fmt == "text":
        print(format_text(data))
    else:
        print(json.dumps(data, indent=2))


if __name__ == "__main__":
    main()
