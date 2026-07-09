#!/usr/bin/env python3
"""manifest.py — the deterministic layer of the project-docs review.

Usage:
    manifest.py <repo-root> [--format=json|text]

Emits ONE structured manifest describing every Markdown doc in <repo-root>. This
is the entire hand-off from the deterministic layer to the review workflow: the
workflow reads this JSON and never re-derives a mechanical fact from it.

What is a *fact* here (and therefore lives in this script, never in an agent):

  - which Markdown files exist (root + docs/ recursively)
  - which canonical/standard files are present or missing
  - per-file metrics: line, byte, word, and non-heading-line counts
  - per-file link/reference resolution (file exists, anchor resolves) — a link to
    an existing directory with no anchor resolves OK (valid GitHub navigation)
  - reachability of each doc from AGENTS.md (graph walk over doc links)
  - the CLAUDE.md == @AGENTS.md invariant, hollow docs, location violations,
    injected tool-blocks in steering docs
  - the AGENTS.md route list (the surface the workflow's execution stage tests)

What is NOT a fact and is deliberately absent: any judgment about whether a doc's
content is accurate, belongs where it sits, or is well-written. That is the
workflow's per-file reading agents. Scripts do facts; agents do judgment.

Each file entry also carries its ownership *contract* (audience / inside /
not-inside), parsed from this skill's own references/project-setup.md so there is
a single source of truth and the reading agent gets the boundary inline instead
of having to go find it.

Exits 0 on success, 1 on bad invocation. Never non-zero for doc problems — this
is an inventory, not a gate.
"""

import importlib.util
import json
import os
import re
import sys

# ---------------------------------------------------------------------------
# Canonical doc taxonomy (mirrors references/project-setup.md)
# ---------------------------------------------------------------------------

CANONICAL_ROOT = ["README.md", "AGENTS.md", "CLAUDE.md"]  # required at repo root
OPTIONAL_CANONICAL_ROOT = ["CONTRIBUTING.md"]             # optional at repo root
# Canonical topic docs under docs/. ALL OPTIONAL: create a doc only when there is
# real local guidance; none is ever reported missing. The names are canonical —
# use them if you document the topic (rule R11) — but presence is never required.
CANONICAL_DOCS = [
    "OVERVIEW.md", "CODING.md", "TESTING.md", "RELEASING.md",
    "MONITORING.md", "CHANGE-WORKFLOW.md", "REVIEWING.md", "RUNNING.md",
]
PERSONAL_LOCAL = [".claude.local.md"]
ROOT_META_IGNORE = [
    "SECURITY.md", "CHANGELOG.md", "CODE_OF_CONDUCT.md",
    "LICENSE.md", "NOTICE.md", "AUTHORS.md", "MAINTAINERS.md",
]

# Purpose hint per canonical file — the kind of task the execution stage derives.
# Not a command; a category the workflow's driver turns into a concrete task.
PURPOSE = {
    "README.md": "use", "AGENTS.md": "route",
    "OVERVIEW.md": "find", "CODING.md": "code", "TESTING.md": "test",
    "RELEASING.md": "release", "MONITORING.md": "monitor",
    "CHANGE-WORKFLOW.md": "change", "REVIEWING.md": "review",
    "RUNNING.md": "run", "CONTRIBUTING.md": "contribute",
}

_SCRIPT_DIR = os.path.dirname(os.path.realpath(__file__))
_SETUP_MD = os.path.join(_SCRIPT_DIR, "..", "references", "project-setup.md")


# ---------------------------------------------------------------------------
# Reuse validate-routes.py (kept as the single home of link/anchor logic;
# check-internal-consistency.py imports the same module by path)
# ---------------------------------------------------------------------------

def _load_validate_routes():
    path = os.path.join(_SCRIPT_DIR, "validate-routes.py")
    spec = importlib.util.spec_from_file_location("validate_routes", path)
    if spec is None or spec.loader is None:
        raise ImportError(f"cannot load validate-routes.py from {path}")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


# ---------------------------------------------------------------------------
# Ownership-contract parse (single source of truth: project-setup.md)
# ---------------------------------------------------------------------------

def parse_ownership(setup_path=_SETUP_MD):
    """Parse the 'File ownership boundaries' blocks from project-setup.md.

    Returns {canonical_name: {audience, inside, not_inside}}. Best-effort: if the
    file is absent or restructured, returns {} and the manifest simply omits the
    inline contract (the agent can still read project-setup.md itself).
    """
    try:
        with open(setup_path, encoding="utf-8", errors="replace") as fh:
            lines = fh.read().splitlines()
    except OSError:
        return {}

    contracts = {}
    in_section = False
    cur_name = None
    cur = {}

    heading_re = re.compile(r"^###\s+`([^`]+\.md)`")
    field_re = re.compile(r"^-\s+\*\*(Audience|Inside|Not inside)\*\*:\s*(.*)$")

    def flush():
        if cur_name and cur:
            contracts[cur_name] = dict(cur)

    for ln in lines:
        if ln.startswith("## File ownership boundaries"):
            in_section = True
            continue
        if in_section and ln.startswith("## ") and "ownership" not in ln.lower():
            break  # left the ownership section
        if not in_section:
            continue
        m = heading_re.match(ln)
        if m:
            flush()
            # Ownership blocks head docs with a path (`docs/CODING.md`) or a bare
            # name (`README.md`); key by basename so lookups by canonical name match.
            cur_name = os.path.basename(m.group(1))
            cur = {}
            continue
        fm = field_re.match(ln)
        if fm and cur_name:
            key = fm.group(1).lower().replace(" ", "_")  # audience / inside / not_inside
            cur[key] = fm.group(2).strip()
    flush()
    return contracts


# ---------------------------------------------------------------------------
# File discovery + metrics
# ---------------------------------------------------------------------------

def md_files(repo_root):
    """Root-level *.md plus every *.md under docs/ (recursive), sorted, relative."""
    out = []
    try:
        for e in sorted(os.scandir(repo_root), key=lambda e: e.name):
            if e.is_file(follow_symlinks=False) and e.name.endswith(".md"):
                out.append(e.name)
    except OSError:
        pass
    docs = os.path.join(repo_root, "docs")
    if os.path.isdir(docs):
        for dirpath, dirnames, filenames in os.walk(docs):
            dirnames.sort()
            for fn in sorted(filenames):
                if fn.endswith(".md"):
                    out.append(os.path.relpath(os.path.join(dirpath, fn), repo_root))
    return out


def metrics(abs_path):
    try:
        with open(abs_path, "rb") as fh:
            raw = fh.read()
    except OSError:
        return None
    text = raw.decode("utf-8", errors="replace")
    all_lines = text.splitlines()
    non_heading = sum(1 for ln in all_lines if ln.strip() and not ln.strip().startswith("#"))
    return {
        "lines": len(all_lines),
        "bytes": len(raw),
        "words": len(text.split()),
        "non_heading_lines": non_heading,
    }


def classify(rel_path):
    """Return (classification, canonical_name_or_None)."""
    name = os.path.basename(rel_path)
    at_root = (rel_path == name)
    in_docs = rel_path.startswith("docs" + os.sep) or rel_path.startswith("docs/")

    if at_root and name in CANONICAL_ROOT:
        return "canonical-root", name
    if at_root and name in OPTIONAL_CANONICAL_ROOT:
        return "optional-canonical", name
    if at_root and name in PERSONAL_LOCAL:
        return "personal-local", name
    if at_root and name in ROOT_META_IGNORE:
        return "meta", None
    # docs/<NAME> directly under docs/ — a canonical topic doc (all optional)
    depth = rel_path.replace("\\", "/").count("/")
    if in_docs and depth == 1 and name in CANONICAL_DOCS:
        return "canonical", name
    return "non-standard", None


# ---------------------------------------------------------------------------
# Link resolution + reachability
# ---------------------------------------------------------------------------

def file_links(vr, repo_root, rel_path):
    """Resolve every reference in a doc. Returns (link_records, resolved_targets).

    A link to an existing directory (no anchor) resolves OK for any doc — valid
    GitHub navigation (fixes the historical specs/ , future/ false positives).
    """
    abs_path = os.path.join(repo_root, rel_path)
    content = vr.load_file(abs_path)
    if content is None:
        return [], []
    records = []
    resolved_targets = []
    for ref in vr.extract_references(abs_path, content):
        ok, reason = vr.resolve_reference(ref, repo_root, allow_dir_links=True)
        target_abs = os.path.normpath(os.path.join(os.path.dirname(abs_path), ref["raw_path"]))
        target_rel = os.path.relpath(target_abs, repo_root)
        records.append({
            "line": ref["line"],
            "ref": ref["ref"],
            "kind": ref["kind"],
            "target": target_rel,
            "anchor": ref["anchor"],
            "resolved": ok,
            "reason": reason,
        })
        if ok and target_rel.endswith(".md"):
            resolved_targets.append(target_rel)
    return records, resolved_targets


def compute_reachability(link_map, repo_root):
    """BFS from AGENTS.md over resolved .md links. Returns set of reachable rel paths.

    CLAUDE.md -> @AGENTS.md is the root import; AGENTS.md is the routing surface.
    A doc is reachable if AGENTS.md links it, directly or through another reachable doc.
    """
    reachable = set()
    start = "AGENTS.md"
    if start not in link_map and not os.path.isfile(os.path.join(repo_root, start)):
        return reachable
    frontier = [start]
    reachable.add(start)
    while frontier:
        cur = frontier.pop()
        for tgt in link_map.get(cur, []):
            if tgt not in reachable:
                reachable.add(tgt)
                frontier.append(tgt)
    return reachable


# ---------------------------------------------------------------------------
# AGENTS.md route extraction (execution-stage surface)
# ---------------------------------------------------------------------------

def agents_routes(vr, repo_root):
    """Every route out of AGENTS.md: doc links and named skill references.

    The workflow's execution stage generates one task per route and checks the
    routing chain actually delivers an agent to a working answer.
    """
    abs_path = os.path.join(repo_root, "AGENTS.md")
    content = vr.load_file(abs_path)
    if content is None:
        return []
    routes = []
    # resolvable file/dir links
    for ref in vr.extract_references(abs_path, content):
        ok, reason = vr.resolve_reference(ref, repo_root, allow_dir_links=True)
        target_abs = os.path.normpath(os.path.join(os.path.dirname(abs_path), ref["raw_path"]))
        routes.append({
            "line": ref["line"],
            "target": os.path.relpath(target_abs, repo_root),
            "kind": ref["kind"],
            "resolved": ok,
        })
    # skill references (plugin:skill) — opaque, not filesystem paths
    in_fence = False
    for lineno, raw in enumerate(content.splitlines(), 1):
        s = raw.strip()
        if s.startswith("```") or s.startswith("~~~"):
            in_fence = not in_fence
            continue
        if in_fence:
            continue
        # skill refs (`plugin:skill`) live inside backticks, so match raw (not stripped) text
        for m in re.finditer(r"`([a-z0-9][\w-]*:[\w-]+)`", raw):
            routes.append({
                "line": lineno,
                "target": m.group(1),
                "kind": "skill",
                "resolved": True,  # existence of installed skills is out of scope here
            })
    return routes


# ---------------------------------------------------------------------------
# Injected-block detection (steering docs only)
# ---------------------------------------------------------------------------

_BEGIN_RE = re.compile(r"^\s*<!--\s*BEGIN\s+(.+?)\s*-->\s*$")
_END_RE = re.compile(r"^\s*<!--\s*END\s+(.+?)\s*-->\s*$")
_META_SUFFIX_RE = re.compile(r"(?:\s+\w+:\S+)+\s*$")


def injected_blocks(abs_path):
    try:
        with open(abs_path, encoding="utf-8", errors="replace") as fh:
            lines = fh.readlines()
    except OSError:
        return []
    open_blocks, found = {}, []
    for lineno, line in enumerate(lines, 1):
        m = _BEGIN_RE.match(line)
        if m:
            name = _META_SUFFIX_RE.sub("", m.group(1)).strip()
            if name and name not in open_blocks:
                open_blocks[name] = lineno
            continue
        m = _END_RE.match(line)
        if m:
            name = _META_SUFFIX_RE.sub("", m.group(1)).strip()
            if name in open_blocks:
                begin = open_blocks.pop(name)
                found.append({"name": name, "begin_line": begin, "end_line": lineno})
    return found


# ---------------------------------------------------------------------------
# Build the manifest
# ---------------------------------------------------------------------------

def build(repo_root):
    vr = _load_validate_routes()
    ownership = parse_ownership()
    rels = md_files(repo_root)

    # First pass: per-file records + link map for reachability.
    files = []
    link_map = {}
    present_canonical = set()
    for rel in rels:
        abs_path = os.path.join(repo_root, rel)
        cls, canon = classify(rel)
        links, targets = file_links(vr, repo_root, rel)
        link_map[rel] = targets
        m = metrics(abs_path)
        entry = {
            "path": rel,
            "classification": cls,
            "canonical_name": canon,
            "metrics": m,
            "hollow": bool(m and m["non_heading_lines"] == 0),
            "links": links,
            "unresolved_links": [x for x in links if not x["resolved"]],
            "purpose": PURPOSE.get(canon) if canon else None,
            "contract": ownership.get(canon) if canon else None,
        }
        if canon:
            present_canonical.add(canon)
        files.append(entry)

    reachable = compute_reachability(link_map, repo_root)
    for e in files:
        e["reachable_from_agents"] = (e["path"] == "CLAUDE.md") or (e["path"] in reachable)

    # CLAUDE.md invariant
    claude_abs = os.path.join(repo_root, "CLAUDE.md")
    claude = {"present": os.path.isfile(claude_abs), "canonical": False, "detail": ""}
    if claude["present"]:
        try:
            with open(claude_abs, encoding="utf-8", errors="replace") as fh:
                body = fh.read().strip()
            claude["canonical"] = (body == "@AGENTS.md")
            claude["detail"] = "exactly @AGENTS.md" if claude["canonical"] else f"extra content ({len(body.splitlines())} line(s))"
        except OSError as exc:
            claude["detail"] = f"unreadable: {exc}"
    else:
        claude["detail"] = "missing"

    # Missing canonical: only the required root files. Every docs/ topic doc is
    # optional (created when needed), so none is ever reported missing.
    required = CANONICAL_ROOT
    missing = [n for n in required if n not in present_canonical]

    # Location violations: canonical docs/ file found at root, or root file under docs/
    location_violations = []
    for n in CANONICAL_DOCS:
        if os.path.isfile(os.path.join(repo_root, n)):
            location_violations.append({"file": n, "found_at": n, "expected_at": f"docs/{n}"})
    for n in CANONICAL_ROOT + OPTIONAL_CANONICAL_ROOT:
        if os.path.isfile(os.path.join(repo_root, "docs", n)):
            location_violations.append({"file": n, "found_at": f"docs/{n}", "expected_at": n})

    # Injected blocks in steering docs
    injected = []
    for n in ("CLAUDE.md", "AGENTS.md"):
        p = os.path.join(repo_root, n)
        if os.path.isfile(p):
            for b in injected_blocks(p):
                b["file"] = n
                injected.append(b)

    routes = agents_routes(vr, repo_root)

    non_standard = [e for e in files if e["classification"] == "non-standard"]
    # Orphan = a docs/** or non-standard doc no AGENTS routing reaches. Root entry
    # docs (README/AGENTS/CLAUDE) are entry points, not routed leaves — never orphans.
    orphans = [e["path"] for e in files
               if not e["reachable_from_agents"]
               and e["classification"] not in ("meta", "personal-local", "canonical-root")]

    return {
        "repo_root": os.path.abspath(repo_root),
        "summary": {
            "total_md": len(files),
            "canonical_present": len(present_canonical & set(required)),
            "canonical_missing": len(missing),
            "optional_canonical_present": len(present_canonical & set(CANONICAL_DOCS + OPTIONAL_CANONICAL_ROOT)),
            "non_standard": len(non_standard),
            "unresolved_links": sum(len(e["unresolved_links"]) for e in files),
            "orphans": len(orphans),
            "hollow": sum(1 for e in files if e["hollow"]),
            "location_violations": len(location_violations),
            "injected_blocks": len(injected),
            "claude_md_ok": claude["canonical"],
        },
        "claude_md": claude,
        "missing_canonical": missing,
        "location_violations": location_violations,
        "injected_blocks": injected,
        "orphans": orphans,
        "agents_routes": routes,
        "files": files,
    }


# ---------------------------------------------------------------------------
# Text formatter
# ---------------------------------------------------------------------------

def format_text(data):
    out = []
    s = data["summary"]
    out.append(f"=== manifest: {data['repo_root']} ===")
    out.append(f"  markdown docs: {s['total_md']}  |  canonical present: {s['canonical_present']}  missing: {s['canonical_missing']}")
    out.append(f"  non-standard: {s['non_standard']}  |  unresolved links: {s['unresolved_links']}  orphans: {s['orphans']}  hollow: {s['hollow']}")
    out.append(f"  CLAUDE.md == @AGENTS.md: {s['claude_md_ok']}  |  location violations: {s['location_violations']}  injected blocks: {s['injected_blocks']}")
    if data["missing_canonical"]:
        out.append(f"  MISSING canonical: {', '.join(data['missing_canonical'])}")
    out.append("")
    out.append("--- files ---")
    orphan_set = set(data["orphans"])  # single source of truth, computed in build()
    for e in data["files"]:
        m = e["metrics"] or {}
        tag = e["canonical_name"] or e["classification"]
        flags = []
        if e["hollow"]:
            flags.append("HOLLOW")
        if e["unresolved_links"]:
            flags.append(f"{len(e['unresolved_links'])} dead-link")
        if e["path"] in orphan_set:
            flags.append("ORPHAN")
        flagstr = ("  [" + ", ".join(flags) + "]") if flags else ""
        out.append(f"  {e['path']:<34} {tag:<16} lines={m.get('lines','?'):<4} words={m.get('words','?'):<5} purpose={e['purpose'] or '-'}{flagstr}")
    out.append("")
    out.append(f"--- AGENTS.md routes ({len(data['agents_routes'])}) ---")
    for r in data["agents_routes"]:
        out.append(f"  L{r['line']:<4} {r['kind']:<12} {r['target']}  {'ok' if r['resolved'] else 'UNRESOLVED'}")
    return "\n".join(out)


def main():
    args = sys.argv[1:]
    fmt = "json"
    positional = []
    for a in args:
        if a.startswith("--format="):
            fmt = a.split("=", 1)[1]
        elif a in ("-h", "--help"):
            print(__doc__)
            return
        elif a.startswith("--"):
            print(f"Unknown option: {a}", file=sys.stderr)
            sys.exit(1)
        else:
            positional.append(a)
    if not positional:
        print(f"Usage: {os.path.basename(sys.argv[0])} <repo-root> [--format=json|text]", file=sys.stderr)
        sys.exit(1)
    repo_root = positional[0]
    if not os.path.isdir(repo_root):
        print(f"Error: {repo_root!r} is not a directory", file=sys.stderr)
        sys.exit(1)
    data = build(repo_root)
    print(format_text(data) if fmt == "text" else json.dumps(data, indent=2))


if __name__ == "__main__":
    main()
