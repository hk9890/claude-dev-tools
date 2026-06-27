#!/usr/bin/env python3
# Note: scripts/check-internal-consistency.py imports this module by hardcoded path;
# keep that path in sync if this file is ever moved or renamed.
"""validate-routes.py — resolve @-imports and markdown links in CLAUDE.md / AGENTS.md.

Usage:
    validate-routes.py <repo-root>
    validate-routes.py <repo-root> --include-docs
    validate-routes.py <repo-root> --include-plugins
    validate-routes.py <repo-root> [--include-docs] [--include-plugins] [--json]

Exits 0 if all references resolve, non-zero if any are unresolved.

Reference types detected:
  - @path/to/file  import directives (first non-whitespace char is @, outside fenced
                   code blocks and inline-code spans)
  - [text](path)   inline markdown links
  - [text](path#anchor)  inline links with anchor
  - [ref]: path    reference link definitions

Ignored without flagging:
  - External URLs (http://, https://, mailto:)
  - Skill references like plugin-name:skill-name (opaque, not resolvable as filesystem paths)
  - References inside fenced code blocks (``` or ~~~)

Anchor algorithm: GitHub-style (matches what GitHub renders on hover).
  1. Lowercase the heading text
  2. Replace spaces with '-'
  3. Strip characters that are not alphanumeric, '-', or '_'
  4. Duplicate slugs get '-1', '-2', ... suffixes in document order
     (the first occurrence keeps the bare slug)

  Examples:
    My Section  -> my-section
    My Section  -> my-section-1   (second occurrence)
    My Section  -> my-section-2   (third occurrence)
    C++ Notes   -> c-notes

Known limitation (v1):
  Skill references of the form plugin-name:skill-name (e.g. tasks:tasks-create)
  are opaque identifiers for Claude Code skill plugins and do not map to files on
  disk. They are skipped without flagging. A future version could validate them
  against installed plugin manifests.
"""

import json
import os
import re
import sys

# ---------------------------------------------------------------------------
# Anchor slug generation (GitHub-style)
# ---------------------------------------------------------------------------

def _heading_to_slug(text):
    """Convert heading text to a GitHub-style anchor slug."""
    slug = text.lower()
    slug = slug.replace(" ", "-")
    slug = re.sub(r"[^\w-]", "", slug)
    # \w includes letters, digits, _; that plus - is what we keep
    # but \w also includes unicode — restrict to alphanumeric + _ + -
    slug = re.sub(r"[^a-z0-9_-]", "", slug)
    return slug


def extract_anchors(content):
    """Return the set of valid anchor slugs for all headings in *content*.

    Handles duplicate headings by appending -1, -2, ... in document order
    (the same way GitHub does).
    """
    slugs = set()
    seen = {}  # slug → count of occurrences so far
    in_fence = False

    for line in content.splitlines():
        stripped = line.strip()

        # Track fenced code blocks
        if stripped.startswith("```") or stripped.startswith("~~~"):
            in_fence = not in_fence
            continue

        if in_fence:
            continue

        m = re.match(r"^(#{1,6})\s+(.*)", line)
        if not m:
            continue

        heading_text = m.group(2).strip()
        base_slug = _heading_to_slug(heading_text)

        if base_slug not in seen:
            seen[base_slug] = 0
            slugs.add(base_slug)
        else:
            seen[base_slug] += 1
            slugs.add(f"{base_slug}-{seen[base_slug]}")

    return slugs


# ---------------------------------------------------------------------------
# Reference extraction
# ---------------------------------------------------------------------------

# Pattern for inline links: [text](url) — captures the URL part
_INLINE_LINK_RE = re.compile(r"\[(?:[^\[\]]*(?:\[[^\[\]]*\])?[^\[\]]*)\]\(([^)]+)\)")

# Pattern for reference definitions: [ref]: url (at start of line, optional space)
_REF_DEF_RE = re.compile(r"^\[([^\]]+)\]:\s+(\S+)")

# Pattern for reference uses: [text][ref] — we'll match and resolve via ref definitions
_REF_USE_RE = re.compile(r"\[(?:[^\[\]]+)\]\[([^\]]*)\]")


def _is_external(url):
    """Return True if url is an external URL (http/https/mailto)."""
    return url.startswith(("http://", "https://", "mailto:"))


def _is_skill_ref(path):
    """Return True if path looks like a plugin:skill opaque reference."""
    # Skill refs look like 'plugin-name:skill-name' — contain ':' but are NOT
    # http/https/mailto, and the part before ':' contains no slashes or dots.
    if ":" not in path:
        return False
    prefix = path.split(":", 1)[0]
    return "/" not in prefix and "." not in prefix


def _strip_inline_code(line):
    """Return line with inline-code spans replaced by spaces (to avoid false matches)."""
    # Replace `...` spans with spaces of equal length
    return re.sub(r"`[^`]*`", lambda m: " " * len(m.group()), line)


def extract_references(filepath, content):
    """Extract all references from *content* (from *filepath*).

    Returns a list of dicts:
      {source_file, line, ref, kind, raw_path, anchor}
    """
    refs = []
    lines = content.splitlines()
    in_fence = False
    fence_char = None

    # First pass: collect reference definitions
    ref_defs = {}  # label (lowercase) → (line_no, url)
    for lineno, line in enumerate(lines, 1):
        m = _REF_DEF_RE.match(line)
        if m:
            label = m.group(1).lower()
            url = m.group(2)
            ref_defs[label] = (lineno, url)

    # Second pass: extract references
    for lineno, raw_line in enumerate(lines, 1):
        stripped = raw_line.strip()

        # Track fenced code blocks
        if not in_fence:
            if stripped.startswith("```") or stripped.startswith("~~~"):
                in_fence = True
                fence_char = stripped[:3]
                continue
        else:
            if stripped.startswith(fence_char):
                in_fence = False
                fence_char = None
            continue

        # --- @-import directives ---
        # Strip inline code first to avoid matching `@foo.md`
        clean_line = _strip_inline_code(raw_line)
        m = re.match(r"^(\s*)@(\S+)", clean_line)
        if m and not raw_line.strip().startswith("`"):
            # The @ must be the first non-whitespace character
            leading = m.group(1)
            if not leading or leading.isspace():
                path = m.group(2)
                if not _is_external("@" + path) and not _is_skill_ref(path):
                    refs.append({
                        "source_file": filepath,
                        "line": lineno,
                        "ref": "@" + path,
                        "kind": "at-import",
                        "raw_path": path,
                        "anchor": None,
                    })
            continue

        # --- Inline links ---
        line_no_code = _strip_inline_code(raw_line)
        for m in _INLINE_LINK_RE.finditer(line_no_code):
            url = m.group(1).strip()
            if _is_external(url):
                continue
            if _is_skill_ref(url):
                continue
            # Split anchor
            if "#" in url:
                path, anchor = url.split("#", 1)
            else:
                path, anchor = url, None
            if path or anchor:  # skip bare '#anchor' if path is empty for same-page links
                if path:  # require a file path
                    refs.append({
                        "source_file": filepath,
                        "line": lineno,
                        "ref": url,
                        "kind": "inline-link",
                        "raw_path": path,
                        "anchor": anchor,
                    })

        # --- Reference link usages ---
        for m in _REF_USE_RE.finditer(line_no_code):
            label = m.group(1).lower()
            if not label:
                # Empty label — fallback to text (simplified: skip)
                continue
            if label in ref_defs:
                _, url = ref_defs[label]
                if _is_external(url):
                    continue
                if _is_skill_ref(url):
                    continue
                if "#" in url:
                    path, anchor = url.split("#", 1)
                else:
                    path, anchor = url, None
                if path:
                    refs.append({
                        "source_file": filepath,
                        "line": lineno,
                        "ref": f"[{label}]: {url}",
                        "kind": "ref-link",
                        "raw_path": path,
                        "anchor": anchor,
                    })

    return refs


# ---------------------------------------------------------------------------
# Resolution
# ---------------------------------------------------------------------------

def resolve_reference(ref, repo_root, allow_dir_links=False):
    """Attempt to resolve a reference dict.

    When allow_dir_links is True, a link to an existing directory (no anchor) resolves
    OK (a valid GitHub navigation target). It defaults to False so the steering-doc/docs
    scan stays strict; validate() enables it only for refs sourced from plugins/.

    Returns (resolved: bool, reason: str).
    """
    source_file = ref["source_file"]
    raw_path = ref["raw_path"]
    anchor = ref["anchor"]

    # Resolve path relative to the source file's directory
    source_dir = os.path.dirname(source_file)
    target_path = os.path.normpath(os.path.join(source_dir, raw_path))

    if not os.path.isfile(target_path):
        # A link to an existing directory (no anchor) is a valid navigation target on
        # GitHub (it renders the directory listing). Allowed ONLY when the caller opts in
        # — the plugins/ scan does (see validate()); the steering-doc/docs scan stays
        # strict so a file link typo'd as a bare directory name is still flagged. The rule
        # lives here, in the single resolver, rather than being re-implemented per caller.
        if allow_dir_links and anchor is None and os.path.isdir(target_path):
            return True, "ok (directory target)"
        return False, f"file not found: {target_path}"

    if anchor is not None:
        # Validate anchor against heading slugs in target file
        try:
            with open(target_path, encoding="utf-8", errors="replace") as fh:
                content = fh.read()
        except OSError as exc:
            return False, f"cannot read {target_path}: {exc}"

        valid_anchors = extract_anchors(content)
        if anchor not in valid_anchors:
            return False, f"anchor #{anchor} not found in {target_path} (valid: {sorted(valid_anchors)[:10]})"

    return True, "ok"


# ---------------------------------------------------------------------------
# File loading
# ---------------------------------------------------------------------------

def load_file(path):
    """Read a file and return its content, or None on error."""
    try:
        with open(path, encoding="utf-8", errors="replace") as fh:
            return fh.read()
    except OSError:
        return None


# ---------------------------------------------------------------------------
# Main validation logic
# ---------------------------------------------------------------------------

def validate(repo_root, include_docs=False, include_plugins=False):
    """Run validation and return (unresolved_list, checked_count)."""
    files_to_check = []

    # Always check CLAUDE.md and AGENTS.md
    for name in ("CLAUDE.md", "AGENTS.md"):
        path = os.path.join(repo_root, name)
        if os.path.isfile(path):
            files_to_check.append(path)

    if include_docs:
        docs_dir = os.path.join(repo_root, "docs")
        if os.path.isdir(docs_dir):
            for entry in sorted(os.listdir(docs_dir)):
                if entry.endswith(".md"):
                    files_to_check.append(os.path.join(docs_dir, entry))

    if include_plugins:
        plugins_dir = os.path.join(repo_root, "plugins")
        if os.path.isdir(plugins_dir):
            for dirpath, dirnames, filenames in os.walk(plugins_dir):
                dirnames.sort()
                for fn in sorted(filenames):
                    if fn.endswith(".md"):
                        files_to_check.append(os.path.join(dirpath, fn))

    all_refs = []
    for filepath in files_to_check:
        content = load_file(filepath)
        if content is None:
            continue
        refs = extract_references(filepath, content)
        all_refs.extend(refs)

    # Directory links resolve OK only inside plugins/** (the original verify.sh behavior);
    # steering docs (CLAUDE.md/AGENTS.md) and docs/ stay strict.
    plugins_root = os.path.join(os.path.abspath(repo_root), "plugins") + os.sep

    unresolved = []
    for ref in all_refs:
        allow_dir = os.path.abspath(ref["source_file"]).startswith(plugins_root)
        ok, reason = resolve_reference(ref, repo_root, allow_dir_links=allow_dir)
        if not ok:
            unresolved.append({
                "source_file": ref["source_file"],
                "line": ref["line"],
                "ref": ref["ref"],
                "kind": ref["kind"],
                "reason": reason,
            })

    return unresolved, len(all_refs)


# ---------------------------------------------------------------------------
# Output formatters
# ---------------------------------------------------------------------------

def format_human(unresolved):
    """Return human-readable unresolved reference list."""
    lines = []
    for item in unresolved:
        lines.append(f"{item['source_file']}:{item['line']}: {item['ref']}  [{item['reason']}]")
    return "\n".join(lines)


def format_json(unresolved, checked):
    data = {
        "unresolved": unresolved,
        "summary": {
            "checked": checked,
            "unresolved": len(unresolved),
        },
    }
    return json.dumps(data, indent=2)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main():
    args = sys.argv[1:]
    include_docs = False
    include_plugins = False
    output_json = False
    positional = []

    for arg in args:
        if arg == "--include-docs":
            include_docs = True
        elif arg == "--include-plugins":
            include_plugins = True
        elif arg == "--json":
            output_json = True
        elif arg.startswith("--"):
            print(f"Unknown option: {arg}", file=sys.stderr)
            sys.exit(1)
        else:
            positional.append(arg)

    if not positional:
        print(
            f"Usage: {os.path.basename(sys.argv[0])} <repo-root> "
            f"[--include-docs] [--include-plugins] [--json]",
            file=sys.stderr,
        )
        sys.exit(1)

    repo_root = positional[0]

    if not os.path.isdir(repo_root):
        print(f"Error: {repo_root!r} is not a directory", file=sys.stderr)
        sys.exit(1)

    unresolved, checked = validate(
        repo_root, include_docs=include_docs, include_plugins=include_plugins
    )

    if output_json:
        print(format_json(unresolved, checked))
    else:
        if unresolved:
            print(format_human(unresolved))
        elif checked == 0:
            # Distinguish "nothing to check" from "all references resolved".
            # Same exit code (0), but the human output makes it clear that no
            # validation actually happened — preventing false reassurance.
            scanned = []
            for name in ("CLAUDE.md", "AGENTS.md"):
                p = os.path.join(repo_root, name)
                scanned.append(
                    f"{name} ({'present, no refs' if os.path.isfile(p) else 'missing'})"
                )
            if include_docs:
                docs_dir = os.path.join(repo_root, "docs")
                if os.path.isdir(docs_dir):
                    md_count = sum(
                        1 for f in os.listdir(docs_dir) if f.endswith(".md")
                    )
                    if md_count:
                        scanned.append(f"docs/ ({md_count} .md file(s), no refs)")
                    else:
                        scanned.append("docs/ (no .md files)")
                else:
                    scanned.append("docs/ (missing)")
            if include_plugins:
                plugins_dir = os.path.join(repo_root, "plugins")
                if os.path.isdir(plugins_dir):
                    md_count = sum(
                        1
                        for _dp, _dn, fns in os.walk(plugins_dir)
                        for f in fns
                        if f.endswith(".md")
                    )
                    scanned.append(f"plugins/ ({md_count} .md file(s), no refs)")
                else:
                    scanned.append("plugins/ (missing)")
            print(f"No references found — nothing to check. Scanned: {', '.join(scanned)}")
        else:
            print(f"All {checked} reference(s) resolved OK.")

    sys.exit(1 if unresolved else 0)


if __name__ == "__main__":
    main()
