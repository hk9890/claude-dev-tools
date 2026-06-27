#!/usr/bin/env python3
"""inventory.py — structured doc inventory for a project repo.

Usage:
    inventory.py <repo-root>
    inventory.py <repo-root> --format=text

Exits 0 on success; exits 1 on bad invocation.
"""

import json
import os
import re
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

# Optional-canonical docs/ files — recognized as canonical *when present* but
# never reported missing when absent. Most repos have no local delta for these
# topics, so tooling must not nag for a file the project will never add. A
# project opts in simply by creating the file under docs/.
OPTIONAL_CANONICAL_DOCS = ["REVIEWING.md", "RUNNING.md"]

# Optional-canonical repo-root files — the human-contributor entrypoint.
# Same present-only contract as OPTIONAL_CANONICAL_DOCS (recognized when present,
# never reported missing when absent) but resolved at the repo root, not under
# docs/. Must NOT be added to CANONICAL_ROOT (that would count absence as missing)
# or to the docs/-scoped lists (that would flag the correct root file as misplaced).
OPTIONAL_CANONICAL_ROOT = ["CONTRIBUTING.md"]

# Personal/local files — optional, gitignored, never written by canonical doc
# flows. Surfaced so authors know they exist but not counted as missing.
PERSONAL_LOCAL = [".claude.local.md"]


# ---------------------------------------------------------------------------
# Injected-block detection
# ---------------------------------------------------------------------------
# Steering docs (CLAUDE.md, AGENTS.md) should be hand-authored and small. Some
# external tools (e.g. a tracker CLI) auto-inject content between HTML-comment markers:
#
#   <!-- BEGIN TRACKER INTEGRATION v:1 profile:minimal hash:7510c1e2 -->
#   ... 47 lines of generated content ...
#   <!-- END TRACKER INTEGRATION -->
#
# Detection is generic: any matching BEGIN/END pair flagged regardless of name.

_BEGIN_RE = re.compile(r'^\s*<!--\s*BEGIN\s+(.+?)\s*-->\s*$')
_END_RE = re.compile(r'^\s*<!--\s*END\s+(.+?)\s*-->\s*$')
# Trailing metadata pairs like "v:1 profile:minimal hash:abc" — strip to normalize
_META_SUFFIX_RE = re.compile(r'(?:\s+\w+:\S+)+\s*$')


def _normalize_marker_name(raw):
    return _META_SUFFIX_RE.sub('', raw).strip()


def detect_injected_blocks(filepath):
    """Detect `<!-- BEGIN X -->` ... `<!-- END X -->` blocks in *filepath*.

    Returns a list of dicts: {name, begin_line, end_line, lines}.
    Pairs are matched by normalized marker name; unmatched BEGIN/END are ignored.
    """
    try:
        with open(filepath, encoding='utf-8', errors='replace') as fh:
            lines = fh.readlines()
    except OSError:
        return []

    open_blocks = {}  # name -> begin_line
    found = []
    for lineno, line in enumerate(lines, 1):
        m = _BEGIN_RE.match(line)
        if m:
            name = _normalize_marker_name(m.group(1))
            if name and name not in open_blocks:
                open_blocks[name] = lineno
            continue
        m = _END_RE.match(line)
        if m:
            name = _normalize_marker_name(m.group(1))
            if name in open_blocks:
                begin = open_blocks.pop(name)
                found.append({
                    'name': name,
                    'begin_line': begin,
                    'end_line': lineno,
                    'lines': lineno - begin + 1,
                })
    return found


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

    # ── optional-canonical docs/ docs (counted only when present) ────────────
    # Recognized as canonical when a project opts in by creating the file, but
    # never added to the map when absent — so an absent optional doc never
    # inflates canonical_missing and never triggers a "missing canonical doc"
    # warning in verify.sh.
    for name in OPTIONAL_CANONICAL_DOCS:
        path = os.path.join(repo_root, "docs", name)
        if not os.path.isfile(path):
            continue
        lines, nhl = count_lines(path)
        canonical[name] = {
            "present": True,
            "path": os.path.join("docs", name),
            "lines": lines,
            "non_heading_lines": nhl,
            "optional": True,
        }

    # ── optional-canonical repo-root files (counted only when present) ───────
    # Same present-only contract as the optional docs/ loop above, but resolved
    # at the repo root (e.g. CONTRIBUTING.md) rather than under docs/.
    for name in OPTIONAL_CANONICAL_ROOT:
        path = os.path.join(repo_root, name)
        if not os.path.isfile(path):
            continue
        lines, nhl = count_lines(path)
        canonical[name] = {
            "present": True,
            "path": name,
            "lines": lines,
            "non_heading_lines": nhl,
            "optional": True,
        }

    # ── personal/local files (optional) ────────────────────────────────────

    personal_local = {}
    for name in PERSONAL_LOCAL:
        path = os.path.join(repo_root, name)
        present = os.path.isfile(path)
        if present:
            rel = name
            lines, nhl = count_lines(path)
        else:
            rel = None
            lines = None
            nhl = None
        personal_local[name] = {
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
                    if entry.name not in CANONICAL_DOCS and entry.name not in OPTIONAL_CANONICAL_DOCS and entry.name not in OPTIONAL_CANONICAL_ROOT:
                        lines, nhl = count_lines(entry.path)
                        non_canonical_docs.append({
                            "path": os.path.join("docs", entry.name),
                            "lines": lines,
                            "non_heading_lines": nhl,
                        })

    # ── location violations ──────────────────────────────────────────────────
    # Canonical docs/ files found at the repo root (or vice-versa).

    location_violations = []

    for name in CANONICAL_DOCS + OPTIONAL_CANONICAL_DOCS:
        wrong_path = os.path.join(repo_root, name)
        if os.path.isfile(wrong_path):
            location_violations.append({
                "file": name,
                "found_at": name,
                "expected_at": os.path.join("docs", name),
            })

    for name in CANONICAL_ROOT + OPTIONAL_CANONICAL_ROOT:
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

    personal_local_present = sum(1 for v in personal_local.values() if v["present"])

    # ── injected blocks in steering docs (CLAUDE.md + AGENTS.md only) ──────

    injected_blocks = []
    for name in ("CLAUDE.md", "AGENTS.md"):
        path = os.path.join(repo_root, name)
        if not os.path.isfile(path):
            continue
        for blk in detect_injected_blocks(path):
            blk["file"] = name
            injected_blocks.append(blk)

    summary = {
        "canonical_present": canonical_present,
        "canonical_missing": canonical_missing,
        "non_canonical_count": len(non_canonical_docs),
        "non_canonical_subdir_count": len(non_canonical_subdirs),
        "violation_count": len(location_violations),
        "personal_local_present": personal_local_present,
        "injected_block_count": len(injected_blocks),
    }

    return {
        "canonical": canonical,
        "personal_local": personal_local,
        "non_canonical_docs": non_canonical_docs,
        "non_canonical_subdirs": non_canonical_subdirs,
        "location_violations": location_violations,
        "injected_blocks": injected_blocks,
        "summary": summary,
    }


# ---------------------------------------------------------------------------
# Text formatter
# ---------------------------------------------------------------------------

def _fmt_doc(name, entry):
    status = "present" if entry["present"] else "MISSING"
    label = f"{name} (optional)" if entry.get("optional") else name
    if entry["present"]:
        return (
            f"  {label}: {status}  "
            f"lines={entry['lines']}  non_heading_lines={entry['non_heading_lines']}"
        )
    return f"  {label}: {status}"


def format_text(data):
    lines = []

    lines.append("=== Canonical docs ===")
    for name, entry in data["canonical"].items():
        lines.append(_fmt_doc(name, entry))

    lines.append("")
    lines.append("=== Personal/local files (optional, gitignored) ===")
    for name, entry in data["personal_local"].items():
        if entry["present"]:
            lines.append(_fmt_doc(name, entry))
        else:
            lines.append(f"  {name}: (none)")

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
    lines.append("=== Injected blocks in steering docs ===")
    if data["injected_blocks"]:
        for b in data["injected_blocks"]:
            lines.append(
                f"  {b['file']}: '{b['name']}' lines {b['begin_line']}-{b['end_line']} ({b['lines']} lines)"
            )
    else:
        lines.append("  (none)")

    lines.append("")
    lines.append("=== Summary ===")
    s = data["summary"]
    lines.append(f"  canonical_present:          {s['canonical_present']}")
    lines.append(f"  canonical_missing:          {s['canonical_missing']}")
    lines.append(f"  personal_local_present:     {s['personal_local_present']}")
    lines.append(f"  non_canonical_count:        {s['non_canonical_count']}")
    lines.append(f"  non_canonical_subdir_count: {s['non_canonical_subdir_count']}")
    lines.append(f"  violation_count:            {s['violation_count']}")
    lines.append(f"  injected_block_count:       {s['injected_block_count']}")

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
