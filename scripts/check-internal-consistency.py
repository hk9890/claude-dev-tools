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

    The heading-scan, inline-code, and GitHub heading-slug helpers are imported
    from validate-routes.py (not copied) via importlib.

Check B — version mirror:
    Compares each plugins/*/.claude-plugin/plugin.json "version" against the
    matching entry in .claude-plugin/marketplace.json. Any mismatch or missing
    entry => FAIL.

Check C — description mirror:
    Compares each plugins/*/.claude-plugin/plugin.json "description" against the
    matching entry in .claude-plugin/marketplace.json. Any mismatch or missing
    entry => FAIL. On mismatch, shows a one-line diff of the two values.

Check D — version uniformity:
    Enforces the single-version lockstep documented in docs/RELEASING.md: the
    marketplace metadata.version and every plugin *entry* version in
    marketplace.json must be the identical string. More than one distinct value
    => FAIL. This is marketplace-only by design; combined with Check B (each
    plugin.json mirrors its entry) it transitively guarantees every plugin.json
    also shares that one version. It catches a lone plugin bumped out of lockstep
    even when its own plugin.json and marketplace entry agree — the gap Check B
    alone cannot see.

All checks run regardless of each other; all failures are reported before exit.

Fixture override flags (used by negative tests):
    --check-sections <file>...   scan only these specific markdown files
    --check-versions <pj>...     check only these plugin.json files
    --marketplace <file>         use this marketplace.json instead of the default
    --skip-sections              skip Check A entirely (useful for version-only tests)
    --skip-versions              skip Check B entirely (useful for section-only tests)
    --skip-descriptions          skip Check C entirely
    --skip-uniformity            skip Check D entirely

Path resolution for --check-sections: target .md files referenced inside a
fixture are resolved relative to the fixture file first, then relative to
--repo-root (defaulting to the nearest .git parent of CWD).
"""

import argparse
import importlib.util
import json
import os
import re
import sys

# ---------------------------------------------------------------------------
# Import the heading-slug utilities from validate-routes.py
# ---------------------------------------------------------------------------

def _load_validate_routes(repo_root):
    """Import the validate_routes module from the project-review plugin script."""
    vr_path = os.path.join(
        repo_root,
        "plugins", "project-review", "skills", "project-review-docs", "scripts", "validate-routes.py",
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
    for sub in _candidate_subphrases(phrase):
        # (a) GitHub slug equality
        if vr_mod.heading_to_slug(sub) == heading_slug:
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
        line = vr_mod.strip_inline_code(raw_line)

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

            headings = list(vr_mod.iter_headings(target_content))
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
    .md files in the repo (excluding examples/, notes/, .tasks/, and .git/).

    Returns (failures, total_refs_checked).
    """
    if target_files is None:
        md_files = []
        for dirpath, dirnames, filenames in os.walk(repo_root):
            # Prune directories we never descend into
            dirnames[:] = [
                d for d in dirnames
                if d not in ("examples", "notes", ".git", ".tasks")
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
# Mirror checks — Checks B (version) and C (description)
# ---------------------------------------------------------------------------

def _load_marketplace(marketplace_path):
    """Parse marketplace.json once. Returns (manifest_dict, error) — exactly one is None."""
    try:
        with open(marketplace_path, encoding="utf-8") as fh:
            return json.load(fh), None
    except (OSError, json.JSONDecodeError) as exc:
        return None, f"cannot load marketplace.json at {marketplace_path}: {exc}"


def _discover_plugin_jsons(repo_root):
    """Return every plugins/*/.claude-plugin/plugin.json path, sorted by plugin name."""
    plugin_json_files = []
    plugins_dir = os.path.join(repo_root, "plugins")
    if os.path.isdir(plugins_dir):
        for plugin_name in sorted(os.listdir(plugins_dir)):
            pj = os.path.join(plugins_dir, plugin_name, ".claude-plugin", "plugin.json")
            if os.path.isfile(pj):
                plugin_json_files.append(pj)
    return plugin_json_files


def _version_mismatch(pj_path, name, pj_value, market_value):
    return (
        f"{pj_path}: version mismatch for {name!r} — "
        f"plugin.json={pj_value!r}, marketplace.json={market_value!r}"
    )


def _description_mismatch(pj_path, name, pj_value, market_value):
    return (
        f"{pj_path}: description mismatch for {name!r}\n"
        f"  - plugin.json:    {pj_value!r}\n"
        f"  + marketplace.json: {market_value!r}"
    )


def run_mirror_check(field, marketplace, marketplace_path, plugin_json_files,
                     format_mismatch):
    """Shared engine for Checks B and C.

    Compares each plugin.json *field* against the matching entry in the
    already-parsed *marketplace* manifest. Any mismatch or missing entry =>
    FAIL, formatted by *format_mismatch*.

    Returns list of failure strings.
    """
    market_values = {
        entry.get("name"): entry.get(field)
        for entry in marketplace.get("plugins", [])
        if entry.get("name")
    }

    failures = []

    for pj_path in sorted(plugin_json_files):
        try:
            with open(pj_path, encoding="utf-8") as fh:
                pj = json.load(fh)
        except (OSError, json.JSONDecodeError) as exc:
            failures.append(f"cannot load {pj_path}: {exc}")
            continue

        name = pj.get("name")

        if not name:
            failures.append(f"{pj_path}: missing 'name' field")
            continue

        if name not in market_values:
            failures.append(
                f"{pj_path}: plugin {name!r} not found in marketplace.json "
                f"({marketplace_path})"
            )
        elif pj.get(field) != market_values[name]:
            failures.append(
                format_mismatch(pj_path, name, pj.get(field), market_values[name])
            )

    return failures


# ---------------------------------------------------------------------------
# Version-uniformity check — Check D
# ---------------------------------------------------------------------------

def run_version_uniformity_check(marketplace):
    """Run Check D — version uniformity.

    Asserts the single-version lockstep from docs/RELEASING.md: marketplace
    metadata.version and every plugin-entry version in the already-parsed
    *marketplace* manifest must be the identical string. Marketplace-only by
    design — Check B already pins each plugin.json to its entry, so B + D
    together enforce full lockstep while D stays cleanly testable with a
    --marketplace override.

    Returns list of failure strings.
    """
    # Collect (source label, version) across every version field in the manifest.
    seen = []

    meta_version = marketplace.get("metadata", {}).get("version")
    if meta_version is not None:
        seen.append(("marketplace.json metadata.version", meta_version))

    for entry in marketplace.get("plugins", []):
        name = entry.get("name")
        if name:
            seen.append((f"marketplace.json plugins[{name}]", entry.get("version")))

    distinct = {version for _, version in seen}
    if len(distinct) <= 1:
        return []

    # Lockstep broken — group sources by the version they carry for a clear report.
    by_version = {}
    for source, version in seen:
        by_version.setdefault(version, []).append(source)

    lines = [
        "version lockstep broken — marketplace metadata.version and all plugin "
        "entries must share one version (see docs/RELEASING.md); found:"
    ]
    for version in sorted(by_version, key=lambda v: (v is None, str(v))):
        lines.append(f"      {version!r}: {', '.join(by_version[version])}")
    return ["\n".join(lines)]


# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------

# This script lives in <repo-root>/scripts/, so the repo root is one level up.
_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.realpath(__file__)))


def _parse_args(argv):
    parser = argparse.ArgumentParser(
        description="Validate internal cross-references and version mirrors.",
    )
    parser.add_argument(
        "repo_root_pos", nargs="?", metavar="REPO_ROOT", default=None,
        help="repo root (positional alternative to --repo-root)")
    parser.add_argument(
        "--repo-root", dest="repo_root", default=None,
        help="repo root (default: this script's repository)")
    parser.add_argument(
        "--check-sections", nargs="+", metavar="FILE", default=None,
        help="scan only these markdown files for Check A (default: full repo scan)")
    parser.add_argument(
        "--check-versions", nargs="+", metavar="PLUGIN_JSON", default=None,
        help="check only these plugin.json files for Checks B/C (default: discover all)")
    parser.add_argument(
        "--marketplace", default=None,
        help="marketplace.json to check against (default: <repo-root>/.claude-plugin/marketplace.json)")
    parser.add_argument("--skip-sections", action="store_true",
                        help="skip Check A entirely")
    parser.add_argument("--skip-versions", action="store_true",
                        help="skip Check B entirely")
    parser.add_argument("--skip-descriptions", action="store_true",
                        help="skip Check C entirely")
    parser.add_argument("--skip-uniformity", action="store_true",
                        help="skip Check D entirely")
    args = parser.parse_args(argv)

    if args.repo_root is None:
        args.repo_root = args.repo_root_pos if args.repo_root_pos else _REPO_ROOT
    return args


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main():
    args = _parse_args(sys.argv[1:])

    repo_root = os.path.abspath(args.repo_root)

    if not os.path.isdir(repo_root):
        print(f"Error: repo root {repo_root!r} is not a directory", file=sys.stderr)
        sys.exit(1)

    # Load the heading-scan/slug utilities from validate-routes.py
    try:
        vr_mod = _load_validate_routes(repo_root)
    except Exception as exc:
        print(f"Error: cannot load validate-routes.py: {exc}", file=sys.stderr)
        sys.exit(1)

    all_failures = []

    # ------------------------------------------------------------------
    # Check A — section references
    # ------------------------------------------------------------------
    if args.skip_sections:
        print("CHECK A — section references: SKIPPED")
    else:
        section_failures, section_total = run_section_check(
            repo_root,
            vr_mod,
            target_files=args.check_sections,
        )

        if section_failures:
            print("CHECK A — section references: FAILED")
            for f in section_failures:
                print(f"  FAIL: {f}")
            all_failures.extend(section_failures)
        else:
            if section_total == 0 and args.check_sections is None:
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
    # Checks B, C, D share one parsed marketplace.json and one plugin.json
    # discovery pass.
    # ------------------------------------------------------------------
    marketplace_path = args.marketplace or os.path.join(
        repo_root, ".claude-plugin", "marketplace.json")
    marketplace, load_error = _load_marketplace(marketplace_path)
    if args.check_versions is not None:
        plugin_json_files = args.check_versions
    else:
        plugin_json_files = _discover_plugin_jsons(repo_root)

    mirror_checks = [
        ("CHECK B — version mirror", args.skip_versions, "version", _version_mismatch),
        ("CHECK C — description mirror", args.skip_descriptions, "description",
         _description_mismatch),
    ]
    for label, skipped, field, format_mismatch in mirror_checks:
        if skipped:
            print(f"{label}: SKIPPED")
            continue
        if load_error:
            failures = [load_error]
        else:
            failures = run_mirror_check(
                field, marketplace, marketplace_path, plugin_json_files,
                format_mismatch,
            )
        if failures:
            print(f"{label}: FAILED")
            for f in failures:
                print(f"  FAIL: {f}")
            all_failures.extend(failures)
        else:
            print(f"{label}: PASS")

    # ------------------------------------------------------------------
    # Check D — version uniformity
    # ------------------------------------------------------------------
    if args.skip_uniformity:
        print("CHECK D — version uniformity: SKIPPED")
    else:
        if load_error:
            uniformity_failures = [load_error]
        else:
            uniformity_failures = run_version_uniformity_check(marketplace)

        if uniformity_failures:
            print("CHECK D — version uniformity: FAILED")
            for f in uniformity_failures:
                print(f"  FAIL: {f}")
            all_failures.extend(uniformity_failures)
        else:
            print("CHECK D — version uniformity: PASS")

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
