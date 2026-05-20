#!/usr/bin/env python3
"""check-internal-consistency.py — validate internal cross-references and version mirrors.

Usage:
    check-internal-consistency.py [--repo-root <dir>]
                                   [--check-sections <file> [<file> ...]]
                                   [--check-versions <plugin-json> [<plugin-json> ...]]
                                   [--marketplace <marketplace-json>]

Exits 0 if all checks pass, non-zero if any check fails.

Check A — section references:
    Scans markdown files in the repo for anchored prose patterns of the form
    "<Phrase> section in <file>.md" or "<file>.md's <Phrase> section". For each
    match, resolves <file>.md relative to the referencing file (then falls back to
    repo root) and checks whether <Phrase> matches a heading in that file by:
      (a) GitHub heading-slug equality, or
      (b) case-insensitive substring match of <Phrase> against heading text.
    Unresolved reference => FAIL with file:line. Skips content inside fenced code
    blocks and inline code spans. Skips any file whose path contains an examples/
    or notes/ directory segment.

    The GitHub heading-slug function is imported from validate-routes.py (not
    copied) via importlib.

Check B — version mirror:
    Compares each plugins/*/.claude-plugin/plugin.json "version" against the
    matching entry in .claude-plugin/marketplace.json. Any mismatch or missing
    entry => FAIL.

Both checks run regardless of each other; all failures are reported before exit.

Fixture override flags (used by negative tests):
    --check-sections <file>...   scan only these specific markdown files
    --check-versions <pj>...     check only these plugin.json files
    --marketplace <file>         use this marketplace.json instead of the default
    --skip-sections              skip Check A entirely (useful for version-only tests)
    --skip-versions              skip Check B entirely (useful for section-only tests)

Path resolution for --check-sections: target .md files referenced inside a
fixture are resolved relative to the fixture file first, then relative to
--repo-root (defaulting to the nearest .git parent of CWD).
"""

import importlib.util
import json
import os
import re
import sys

# ---------------------------------------------------------------------------
# Import the heading-slug utilities from validate-routes.py
# ---------------------------------------------------------------------------

def _load_validate_routes(repo_root):
    """Import the validate_routes module from the project-docs plugin script."""
    vr_path = os.path.join(
        repo_root,
        "plugins", "project-docs", "skills", "project-docs", "scripts", "validate-routes.py",
    )
    spec = importlib.util.spec_from_file_location("validate_routes", vr_path)
    if spec is None or spec.loader is None:
        raise ImportError(f"Cannot load validate-routes.py from {vr_path}")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


# ---------------------------------------------------------------------------
# Section-reference scanner — Check A
# ---------------------------------------------------------------------------

# Forward pattern: "<Phrase> section in <file>.md"
# Phrase = 1–6 words immediately before " section in"; the phrase itself must not
# contain the word "section" (to avoid matching "foo section section in bar.md").
# Using a repeated word group bounded to 6 to keep the phrase compact.
_SECTION_FWD_RE = re.compile(
    r"""
    \b
    (                             # capture group 1: the phrase
      (?:[\w'`\-]+\s+){0,5}      # up to 5 leading words (each followed by a space)
      [\w'`\-]+                   # final word of phrase (no trailing space)
    )
    \s+section\s+in\s+            # " section in "
    ([\w][\w./\-]*)               # capture group 2: filename stem
    \.md\b                        # must end with .md
    """,
    re.VERBOSE | re.IGNORECASE,
)

# Possessive pattern: "<file>.md's <Phrase> section"
_SECTION_POSS_RE = re.compile(
    r"""
    \b([\w][\w./\-]*)             # capture group 1: filename stem
    \.md's\s+                     # ".md's "
    (                             # capture group 2: the phrase
      (?:[\w'`\-]+\s+){0,5}
      [\w'`\-]+
    )
    \s+section\b
    """,
    re.VERBOSE | re.IGNORECASE,
)


def _strip_inline_code(line):
    """Replace inline-code spans with spaces so they are not scanned."""
    return re.sub(r"`[^`]*`", lambda m: " " * len(m.group()), line)


def _path_has_excluded_segment(path):
    """Return True if any path component is 'examples' or 'notes'."""
    parts = path.replace("\\", "/").split("/")
    return any(p in ("examples", "notes") for p in parts)


def _find_target_file(filename, source_dir, repo_root):
    """Resolve <filename>: try source_dir-relative first, then repo-root-relative."""
    rel_path = os.path.normpath(os.path.join(source_dir, filename))
    if os.path.isfile(rel_path):
        return rel_path
    root_path = os.path.normpath(os.path.join(repo_root, filename))
    if os.path.isfile(root_path):
        return root_path
    return None


def _collect_headings(content, vr_mod):
    """Return list of (heading_text, slug) for all headings in *content*.

    Uses the validate-routes slug algorithm so duplicate headings get the same
    -1/-2 suffixes that GitHub generates.
    """
    headings = []
    seen = {}
    in_fence = False

    for line in content.splitlines():
        stripped = line.strip()
        if stripped.startswith("```") or stripped.startswith("~~~"):
            in_fence = not in_fence
            continue
        if in_fence:
            continue
        m = re.match(r"^(#{1,6})\s+(.*)", line)
        if not m:
            continue
        heading_text = m.group(2).strip()
        base_slug = vr_mod._heading_to_slug(heading_text)
        if base_slug not in seen:
            seen[base_slug] = 0
            slug = base_slug
        else:
            seen[base_slug] += 1
            slug = f"{base_slug}-{seen[base_slug]}"
        headings.append((heading_text, slug))

    return headings


_STOP_WORDS = frozenset({
    "a", "an", "the", "this", "that", "these", "those",
    "see", "read", "check", "load", "follow", "use", "find",
    "refer", "consult", "visit",
})


def _candidate_subphrases(phrase):
    """Yield candidate subphrases to try against a heading.

    Progressively strips leading stop-words so "See the Script tests" also
    tries "Script tests". Requires at least 2 words in each candidate to avoid
    single-word fragments accidentally matching unrelated headings.

    Example: "See the Script tests" yields
      "See the Script tests", "the Script tests", "Script tests"
    """
    words = phrase.split()
    seen = set()
    for begin in range(len(words)):
        remaining = words[begin:]
        if len(remaining) < 2:
            break
        sub = " ".join(remaining)
        if sub not in seen:
            seen.add(sub)
            yield sub


def _phrase_matches_heading(phrase, heading_text, heading_slug, vr_mod):
    """Return True if phrase (or any right-aligned subphrase after stripping
    leading stop-words) resolves to the given heading by slug or substring.

    This handles prose like "See the Script tests section in TESTING.md"
    where the intended phrase is "Script tests", not "See the Script tests".
    """
    seen = set()
    for sub in _candidate_subphrases(phrase):
        if sub in seen:
            continue
        seen.add(sub)
        if not sub:
            continue
        # (a) GitHub slug equality
        if vr_mod._heading_to_slug(sub) == heading_slug:
            return True
        # (b) Case-insensitive substring
        if sub.lower() in heading_text.lower():
            return True
    return False


def _scan_file_for_section_refs(filepath, vr_mod, repo_root):
    """Scan one markdown file for anchored section references.

    Returns list of (lineno, phrase, target_filename, ok, reason).
    """
    try:
        with open(filepath, encoding="utf-8", errors="replace") as fh:
            content = fh.read()
    except OSError as exc:
        return [(0, "", filepath, False, f"cannot read file: {exc}")]

    source_dir = os.path.dirname(os.path.abspath(filepath))
    results = []
    in_fence = False

    for lineno, raw_line in enumerate(content.splitlines(), 1):
        stripped = raw_line.strip()

        # Track fenced code blocks
        if stripped.startswith("```") or stripped.startswith("~~~"):
            in_fence = not in_fence
            continue
        if in_fence:
            continue

        # Strip inline code spans before scanning
        line = _strip_inline_code(raw_line)

        # Collect all (phrase, filename) candidates from this line
        candidates = []
        for m in _SECTION_FWD_RE.finditer(line):
            candidates.append((m.group(1).strip(), m.group(2) + ".md"))
        for m in _SECTION_POSS_RE.finditer(line):
            candidates.append((m.group(2).strip(), m.group(1) + ".md"))

        for phrase, filename in candidates:
            target_path = _find_target_file(filename, source_dir, repo_root)
            if target_path is None:
                results.append(
                    (lineno, phrase, filename, False,
                     f"target file not found: {filename!r} "
                     f"(tried relative to {source_dir} and {repo_root})")
                )
                continue

            try:
                with open(target_path, encoding="utf-8", errors="replace") as fh:
                    target_content = fh.read()
            except OSError as exc:
                results.append(
                    (lineno, phrase, filename, False,
                     f"cannot read {target_path}: {exc}")
                )
                continue

            headings = _collect_headings(target_content, vr_mod)
            if any(_phrase_matches_heading(phrase, ht, slug, vr_mod) for ht, slug in headings):
                results.append((lineno, phrase, filename, True, "ok"))
            else:
                heading_texts = [ht for ht, _ in headings]
                results.append(
                    (lineno, phrase, filename, False,
                     f"phrase {phrase!r} not found in headings of {target_path}; "
                     f"headings: {heading_texts[:10]}")
                )

    return results


def run_section_check(repo_root, vr_mod, target_files=None):
    """Run Check A — section references.

    If target_files is given, scan only those files. Otherwise discover all
    .md files in the repo (excluding examples/ and notes/ subtrees and .git/).

    Returns (failures, total_refs_checked).
    """
    if target_files is None:
        md_files = []
        for dirpath, dirnames, filenames in os.walk(repo_root):
            # Prune directories we never descend into
            dirnames[:] = [
                d for d in dirnames
                if d not in ("examples", "notes", ".git")
            ]
            for fn in filenames:
                if fn.endswith(".md"):
                    full = os.path.join(dirpath, fn)
                    if not _path_has_excluded_segment(full):
                        md_files.append(full)
    else:
        md_files = list(target_files)

    failures = []
    total = 0

    for filepath in sorted(md_files):
        refs = _scan_file_for_section_refs(filepath, vr_mod, repo_root)
        total += len(refs)
        for lineno, phrase, filename, ok, reason in refs:
            if not ok:
                failures.append(
                    f"{filepath}:{lineno}: phrase {phrase!r} section in {filename!r} — {reason}"
                )

    return failures, total


# ---------------------------------------------------------------------------
# Version-mirror check — Check B
# ---------------------------------------------------------------------------

def run_version_check(repo_root, plugin_json_files=None, marketplace_path=None):
    """Run Check B — version mirror.

    Compares each plugin.json "version" against the matching entry in
    marketplace.json. Any mismatch or missing entry => FAIL.

    Returns list of failure strings.
    """
    if marketplace_path is None:
        marketplace_path = os.path.join(repo_root, ".claude-plugin", "marketplace.json")

    try:
        with open(marketplace_path, encoding="utf-8") as fh:
            marketplace = json.load(fh)
    except (OSError, json.JSONDecodeError) as exc:
        return [f"cannot load marketplace.json at {marketplace_path}: {exc}"]

    # Build lookup: plugin name -> version from marketplace
    market_versions = {
        entry.get("name"): entry.get("version")
        for entry in marketplace.get("plugins", [])
        if entry.get("name")
    }

    if plugin_json_files is None:
        plugin_json_files = []
        plugins_dir = os.path.join(repo_root, "plugins")
        if os.path.isdir(plugins_dir):
            for plugin_name in sorted(os.listdir(plugins_dir)):
                pj = os.path.join(plugins_dir, plugin_name, ".claude-plugin", "plugin.json")
                if os.path.isfile(pj):
                    plugin_json_files.append(pj)

    failures = []

    for pj_path in sorted(plugin_json_files):
        try:
            with open(pj_path, encoding="utf-8") as fh:
                pj = json.load(fh)
        except (OSError, json.JSONDecodeError) as exc:
            failures.append(f"cannot load {pj_path}: {exc}")
            continue

        name = pj.get("name")
        pj_version = pj.get("version")

        if not name:
            failures.append(f"{pj_path}: missing 'name' field")
            continue

        if name not in market_versions:
            failures.append(
                f"{pj_path}: plugin {name!r} not found in marketplace.json "
                f"({marketplace_path})"
            )
        elif pj_version != market_versions[name]:
            failures.append(
                f"{pj_path}: version mismatch for {name!r} — "
                f"plugin.json={pj_version!r}, marketplace.json={market_versions[name]!r}"
            )

    return failures


# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------

def _parse_args(argv):
    """Return a dict with keys: repo_root, check_sections, check_versions, marketplace,
    skip_sections, skip_versions."""
    parsed = {
        "repo_root": None,
        "check_sections": None,   # None = full repo scan
        "check_versions": None,   # None = full plugin discovery
        "marketplace": None,
        "skip_sections": False,
        "skip_versions": False,
    }

    i = 0
    while i < len(argv):
        arg = argv[i]
        if arg == "--repo-root":
            i += 1
            parsed["repo_root"] = argv[i]
        elif arg in ("--check-sections", "--check-versions"):
            i += 1
            files = []
            while i < len(argv) and not argv[i].startswith("--"):
                files.append(argv[i])
                i += 1
            if arg == "--check-sections":
                parsed["check_sections"] = files
            else:
                parsed["check_versions"] = files
            continue
        elif arg == "--marketplace":
            i += 1
            parsed["marketplace"] = argv[i]
        elif arg == "--skip-sections":
            parsed["skip_sections"] = True
        elif arg == "--skip-versions":
            parsed["skip_versions"] = True
        elif arg.startswith("--"):
            print(f"Unknown option: {arg}", file=sys.stderr)
            sys.exit(1)
        else:
            # Bare positional: treat as repo_root
            if parsed["repo_root"] is None:
                parsed["repo_root"] = arg
        i += 1

    return parsed


def _find_repo_root(start_dir):
    """Walk up from start_dir looking for a .git directory."""
    candidate = os.path.abspath(start_dir)
    while True:
        if os.path.isdir(os.path.join(candidate, ".git")):
            return candidate
        parent = os.path.dirname(candidate)
        if parent == candidate:
            return start_dir  # reached filesystem root
        candidate = parent


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main():
    parsed = _parse_args(sys.argv[1:])

    if parsed["repo_root"] is None:
        parsed["repo_root"] = _find_repo_root(os.getcwd())

    repo_root = os.path.abspath(parsed["repo_root"])

    if not os.path.isdir(repo_root):
        print(f"Error: repo root {repo_root!r} is not a directory", file=sys.stderr)
        sys.exit(1)

    # Load the heading-slug utilities from validate-routes.py
    try:
        vr_mod = _load_validate_routes(repo_root)
    except Exception as exc:
        print(f"Error: cannot load validate-routes.py: {exc}", file=sys.stderr)
        sys.exit(1)

    all_failures = []

    # ------------------------------------------------------------------
    # Check A — section references
    # ------------------------------------------------------------------
    if parsed["skip_sections"]:
        print("CHECK A — section references: SKIPPED")
    else:
        section_failures, section_total = run_section_check(
            repo_root,
            vr_mod,
            target_files=parsed["check_sections"],
        )

        if section_failures:
            print("CHECK A — section references: FAILED")
            for f in section_failures:
                print(f"  FAIL: {f}")
            all_failures.extend(section_failures)
        else:
            if section_total == 0 and parsed["check_sections"] is None:
                # A no-op scanner must not be confused with a passing scanner.
                # The acceptance criterion requires >=1 real reference be resolved.
                print(
                    "CHECK A — section references: WARNING — no anchored section references "
                    "found in the repo; verify the scanner is matching real patterns"
                )
            else:
                print(
                    f"CHECK A — section references: PASS "
                    f"({section_total} reference(s) resolved OK)"
                )

    # ------------------------------------------------------------------
    # Check B — version mirror
    # ------------------------------------------------------------------
    if parsed["skip_versions"]:
        print("CHECK B — version mirror: SKIPPED")
    else:
        version_failures = run_version_check(
            repo_root,
            plugin_json_files=parsed["check_versions"],
            marketplace_path=parsed["marketplace"],
        )

        if version_failures:
            print("CHECK B — version mirror: FAILED")
            for f in version_failures:
                print(f"  FAIL: {f}")
            all_failures.extend(version_failures)
        else:
            print("CHECK B — version mirror: PASS")

    # ------------------------------------------------------------------
    # Summary
    # ------------------------------------------------------------------
    if all_failures:
        print(f"\n{len(all_failures)} check(s) failed.")
        sys.exit(1)
    else:
        print("\nAll checks passed.")
        sys.exit(0)


if __name__ == "__main__":
    main()
