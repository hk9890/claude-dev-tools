#!/usr/bin/env python3
"""manifest.py — the deterministic layer of the project-review docs review.

Usage:
    manifest.py <repo-root> [--format=json|text] [--brief]

Emits ONE structured manifest describing every Markdown doc in <repo-root>. This
is the entire hand-off from the deterministic layer to the review workflow: the
workflow reads this JSON and never re-derives a mechanical fact from it.

What is a *fact* here (and therefore lives in this script, never in an agent):

  - which Markdown files exist (root + docs/ recursively)
  - which canonical/standard files are present or missing, and which are decision
    records (docs/decisions/NNNN-*.md)
  - per-record shape flags and the tree's own facts: a number two records share, a
    file in the tree that is no record, a replaced record that is still there
  - per-file metrics: line, byte, word, and non-heading-line counts
  - per-file link/reference resolution (file exists, anchor resolves) — a link to
    an existing directory with no anchor resolves OK (valid GitHub navigation)
  - reachability of each doc from AGENTS.md (graph walk over doc links)
  - the CLAUDE.md == @AGENTS.md invariant, hollow docs, location violations,
    and for a private root (a <repo-root> whose AGENTS.md the parent's CLAUDE.local.md
    imports) that import in its place
    injected tool-blocks in steering docs
  - the personal files (CLAUDE.local.md, and the legacy .claude.local.md with the
    file it moves to), which the review leaves out
  - the AGENTS.md route list (what the read-review and history stages judge routes by)

What is NOT a fact and is deliberately absent: any judgment about whether a doc's
content is accurate, belongs where it sits, or is well-written. That is the
workflow's per-file reading agents. Scripts do facts; agents do judgment.

Exits 0 on success, 1 on bad invocation. Never non-zero for doc problems — this
is an inventory, not a gate.
"""

import importlib.util
import json
import os
import re
import sys

# ---------------------------------------------------------------------------
# Canonical doc taxonomy — mirrors the authoring standard's project-setup.md
# (instruction-writing:writing-project-docs). A new canonical doc has to be
# registered in three plugins; see "Adding a canonical doc" in the
# claude-dev-tools repo's docs/CODING.md.
# ---------------------------------------------------------------------------

CANONICAL_ROOT = ["README.md", "AGENTS.md", "CLAUDE.md"]  # required at repo root
OPTIONAL_CANONICAL_ROOT = ["CONTRIBUTING.md"]             # optional at repo root
# The private layout of a repository the user cannot commit to (private_root.py): the
# parent repository owns README.md and CLAUDE.md, and every file at the folder's top
# level but AGENTS.md is scratch, outside the set.
PRIVATE_REQUIRED = ["AGENTS.md"]
# The one canonical tree: docs/decisions/NNNN-slug.md, one file per decision in force.
DECISIONS_TREE = "decisions/"
DECISION_FILE_RE = re.compile("^" + re.escape("docs/" + DECISIONS_TREE) + r"[0-9]{4}-[^/]+\.md$")
# The shape the tree's contract gives a record: the heading, then at most this many lines.
RECORD_BODY_LINES = 8
_RECORD_HEADING_RE = re.compile(r"^# ([0-9]{4}): \S")
_RECORD_STATUS_RE = re.compile(r"^(?:[>*_\-\s]*(?:status|date)\b[*_\s]*:|#+\s*(?:status|date)\s*$)", re.IGNORECASE)
_RECORD_REPLACES_RE = re.compile(r"^Replaces ([0-9]{4})\b")
# Canonical topics under docs/, in topic-set order: the topic files, then the tree.
# ALL OPTIONAL: create one only when there is real local guidance; none is ever
# reported missing. The names are canonical — use them if you document the topic —
# but presence is never required.
CANONICAL_DOCS = [
    "OVERVIEW.md", "CODING.md", "DOCUMENTING.md", "TESTING.md", "RELEASING.md",
    "MONITORING.md", "CHANGE-WORKFLOW.md", "REVIEWING.md", "RUNNING.md", DECISIONS_TREE,
]
PERSONAL_LOCAL = ["CLAUDE.local.md"]
# Personal files under a name Claude Code never loads, mapped to the name it does load.
LEGACY_PERSONAL_LOCAL = {".claude.local.md": PERSONAL_LOCAL[0]}
# Personal files are out of the review: no links, no hollow flag, never an orphan.
PERSONAL_CLASSES = ("personal-local", "personal-legacy")
ROOT_META_IGNORE = [
    "SECURITY.md", "CHANGELOG.md", "CODE_OF_CONDUCT.md",
    "LICENSE.md", "NOTICE.md", "AUTHORS.md", "MAINTAINERS.md",
]

_SCRIPT_DIR = os.path.dirname(os.path.realpath(__file__))


# ---------------------------------------------------------------------------
# Reuse validate-routes.py (kept as the single home of link/anchor logic;
# check-internal-consistency.py imports the same module by path)
# ---------------------------------------------------------------------------

def _private_root():
    path = os.path.join(_SCRIPT_DIR, "private_root.py")
    spec = importlib.util.spec_from_file_location("private_root", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _load_validate_routes():
    path = os.path.join(_SCRIPT_DIR, "validate-routes.py")
    spec = importlib.util.spec_from_file_location("validate_routes", path)
    if spec is None or spec.loader is None:
        raise ImportError(f"cannot load validate-routes.py from {path}")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


# ---------------------------------------------------------------------------
# File discovery + metrics
# ---------------------------------------------------------------------------

def md_files(repo_root):
    """Root-level *.md plus every *.md under docs/ (recursive), sorted, relative.
    A private root contributes only its AGENTS.md: the rest of its top level is scratch."""
    out = []
    private = _private_root().is_private(repo_root)
    try:
        for e in sorted(os.scandir(repo_root), key=lambda e: e.name):
            if e.is_file(follow_symlinks=False) and e.name.endswith(".md") and (not private or e.name in PRIVATE_REQUIRED):
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
    posix = rel_path.replace("\\", "/")
    in_docs = posix.startswith("docs/")

    if at_root and name in CANONICAL_ROOT:
        return "canonical-root", name
    if at_root and name in OPTIONAL_CANONICAL_ROOT:
        return "optional-canonical", name
    if name in PERSONAL_LOCAL:
        return "personal-local", None
    if name in LEGACY_PERSONAL_LOCAL:
        return "personal-legacy", None
    if at_root and name in ROOT_META_IGNORE:
        return "meta", None
    # docs/<NAME> directly under docs/ — a canonical topic doc (all optional)
    depth = posix.count("/")
    if in_docs and depth == 1 and name in CANONICAL_DOCS:
        return "canonical", name
    if DECISION_FILE_RE.match(posix):
        return "decision", DECISIONS_TREE
    return "non-standard", None


# ---------------------------------------------------------------------------
# Decision records
# ---------------------------------------------------------------------------

def record_facts(abs_path, rel_path):
    """The shape of one record against the tree's contract: its number, the lines under
    its heading, the records it replaces, and a flag for each breach a script can see."""
    number = os.path.basename(rel_path)[:4]
    try:
        with open(abs_path, encoding="utf-8", errors="replace") as fh:
            lines = fh.read().splitlines()
    except OSError:
        return {"number": number, "body_lines": 0, "replaces": [], "flags": ["unreadable"]}
    filled = [(n, ln.strip()) for n, ln in enumerate(lines, 1) if ln.strip()]
    flags = []
    heading = _RECORD_HEADING_RE.match(filled[0][1]) if filled else None
    if not heading:
        flags.append(f"line {filled[0][0] if filled else 1} is not the heading `# {number}: <the decision>`")
    elif heading.group(1) != number:
        flags.append(f"the heading carries {heading.group(1)}, the file name {number}")
    body = filled[1:]
    if len(body) > RECORD_BODY_LINES:
        flags.append(f"{len(body)} lines under the heading, the contract allows {RECORD_BODY_LINES}")
    flags.extend(f"line {n} is a status or date line" for n, ln in body if _RECORD_STATUS_RE.match(ln))
    replaces = [m.group(1) for m in (_RECORD_REPLACES_RE.match(ln) for _, ln in body) if m]
    return {"number": number, "body_lines": len(body), "replaces": replaces, "flags": flags}


def tree_facts(repo_root, files):
    """What only the tree as a whole shows. A file in it that is no record is an index or
    a record in another format; a replaced record that is still there is still in force."""
    records = [e for e in files if e["classification"] == "decision"]
    by_number = {}
    for e in records:
        by_number.setdefault(e["record"]["number"], []).append(e["path"])
    tree = "docs/" + DECISIONS_TREE
    try:
        names = sorted(os.listdir(os.path.join(repo_root, tree)))
    except OSError:
        names = []
    return {
        "records": len(records),
        "flagged": [{"path": e["path"], "flags": e["record"]["flags"]} for e in records if e["record"]["flags"]],
        "duplicate_numbers": [{"number": n, "paths": p} for n, p in sorted(by_number.items()) if len(p) > 1],
        "not_records": [tree + n for n in names if not DECISION_FILE_RE.match(tree + n)],
        "replaced_still_present": [{"path": e["path"], "replaces": n, "still_present": by_number[n]}
                                   for e in records for n in e["record"]["replaces"] if n in by_number],
    }


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
        elif ok and os.path.isdir(target_abs):
            resolved_targets.extend(folder_docs(target_rel, target_abs))
    return records, resolved_targets


def folder_docs(target_rel, target_abs):
    """The docs a folder link stands for: a link to the decisions tree reaches its
    records, since the tree has no index. Any other folder link reaches nothing."""
    posix = target_rel.replace("\\", "/")
    if posix != "docs/" + DECISIONS_TREE.rstrip("/"):
        return []
    try:
        names = sorted(os.listdir(target_abs))
    except OSError:
        return []
    return [os.path.join(target_rel, n) for n in names
            if DECISION_FILE_RE.match(posix + "/" + n) and os.path.isfile(os.path.join(target_abs, n))]


def compute_reachability(link_map, repo_root):
    """BFS from AGENTS.md over resolved .md links, plus the docs a folder link stands
    for (folder_docs). Returns set of reachable rel paths.

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
# AGENTS.md route extraction
# ---------------------------------------------------------------------------

def agents_routes(vr, repo_root):
    """Every route out of AGENTS.md: doc links and named skill references."""
    abs_path = os.path.join(repo_root, "AGENTS.md")
    content = vr.load_file(abs_path)
    if content is None:
        return []
    routes = []
    lines = content.splitlines()
    # resolvable file/dir links
    for ref in vr.extract_references(abs_path, content):
        ok, reason = vr.resolve_reference(ref, repo_root, allow_dir_links=True)
        target_abs = os.path.normpath(os.path.join(os.path.dirname(abs_path), ref["raw_path"]))
        idx = ref["line"] - 1
        routes.append({
            "line": ref["line"],
            "target": os.path.relpath(target_abs, repo_root),
            "kind": ref["kind"],
            "resolved": ok,
            # The route's own wording. A fact (it is just the line), but the one the
            # history stage needs: a miss on an advisory route accuses the doc, while
            # a miss on a hard obligation accuses the agent that skipped it.
            "text": lines[idx].strip()[:300] if 0 <= idx < len(lines) else "",
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

def claude_md_invariant(repo_root):
    """CLAUDE.md must be exactly @AGENTS.md. md_files() skips root-level symlinks, so a
    CLAUDE.md that links to AGENTS.md is present but absent from files[]; reading it
    would read AGENTS.md."""
    claude_abs = os.path.join(repo_root, "CLAUDE.md")
    claude = {"file": "CLAUDE.md", "expected": "@AGENTS.md",
              "present": os.path.islink(claude_abs) or os.path.isfile(claude_abs), "canonical": False, "detail": ""}
    if os.path.islink(claude_abs):
        claude["detail"] = f"symlink to {os.readlink(claude_abs)}, not a file holding the @AGENTS.md import"
    elif claude["present"]:
        claude.update(compare_import(claude_abs, claude["expected"]))
    else:
        claude["detail"] = "missing"
    return claude


def private_import(repo_root):
    """The parent's CLAUDE.local.md imports this folder's AGENTS.md, which is what makes it
    private. The import must be absolute: a git worktree gets a copy of CLAUDE.local.md, and
    a relative import there resolves inside the worktree, which holds no private folder."""
    pr = _private_root()
    paths = pr.imports_of(repo_root)
    absolute = [p for p in paths if pr.is_absolute(p)]
    return {"file": "../" + PERSONAL_LOCAL[0],
            "expected": "@" + os.path.join(os.path.abspath(repo_root), "AGENTS.md"),
            "present": True, "canonical": bool(absolute),
            "detail": f"holds @{absolute[0]}" if absolute else f"relative import @{paths[0]}, which fails in a git worktree"}


def compare_import(abs_path, expected):
    try:
        with open(abs_path, encoding="utf-8", errors="replace") as fh:
            body = fh.read().strip()
    except OSError as exc:
        return {"detail": f"unreadable: {exc}"}
    if body == expected:
        return {"canonical": True, "detail": f"exactly {expected}"}
    return {"detail": f"extra content ({len(body.splitlines())} line(s))"}


def build(repo_root):
    vr = _load_validate_routes()
    rels = md_files(repo_root)

    # First pass: per-file records + link map for reachability.
    files = []
    link_map = {}
    present_canonical = set()
    for rel in rels:
        abs_path = os.path.join(repo_root, rel)
        cls, canon = classify(rel)
        personal = cls in PERSONAL_CLASSES
        links, targets = ([], []) if personal else file_links(vr, repo_root, rel)
        link_map[rel] = targets
        m = metrics(abs_path)
        entry = {
            "path": rel,
            "classification": cls,
            "canonical_name": canon,
            "metrics": m,
            "hollow": not personal and bool(m and m["non_heading_lines"] == 0),
            "links": links,
            "unresolved_links": [x for x in links if not x["resolved"]],
        }
        if cls == "decision":
            entry["record"] = record_facts(abs_path, rel)
        if canon:
            present_canonical.add(canon)
        files.append(entry)

    reachable = compute_reachability(link_map, repo_root)
    for e in files:
        e["reachable_from_agents"] = (e["path"] == "CLAUDE.md") or (e["path"] in reachable)

    private = _private_root().is_private(repo_root)
    claude = private_import(repo_root) if private else claude_md_invariant(repo_root)

    # Missing canonical: only the required root files. Every docs/ topic doc is
    # optional (created when needed), so none is ever reported missing.
    required = PRIVATE_REQUIRED if private else CANONICAL_ROOT
    if claude["present"] and not private:
        present_canonical.add("CLAUDE.md")
    missing = [n for n in required if n not in present_canonical]

    # Location violations: canonical docs/ file found at root, or root file under docs/.
    # The top level of a private root holds scratch, which is outside the set.
    location_violations = []
    for n in (n for n in CANONICAL_DOCS if n.endswith(".md")):
        if not private and os.path.isfile(os.path.join(repo_root, n)):
            location_violations.append({"file": n, "found_at": n, "expected_at": f"docs/{n}"})
    for n in CANONICAL_ROOT + OPTIONAL_CANONICAL_ROOT:
        if os.path.isfile(os.path.join(repo_root, "docs", n)):
            location_violations.append({"file": n, "found_at": f"docs/{n}", "expected_at": n})

    # Injected blocks in steering docs. Scan each real file once: a steering doc that links
    # to the other one would report the same blocks twice, so a link comes after the files.
    injected, scanned = [], set()
    for n in sorted(PRIVATE_REQUIRED if private else ("CLAUDE.md", "AGENTS.md"), key=lambda n: os.path.islink(os.path.join(repo_root, n))):
        p = os.path.join(repo_root, n)
        real = os.path.realpath(p)
        if os.path.isfile(p) and real not in scanned:
            scanned.add(real)
            for b in injected_blocks(p):
                b["file"] = n
                injected.append(b)

    routes = agents_routes(vr, repo_root)
    decisions = tree_facts(repo_root, files)

    non_standard = [e for e in files if e["classification"] == "non-standard"]
    legacy_personal = []
    for e in files:
        if e["classification"] == "personal-legacy":
            target = os.path.join(os.path.dirname(e["path"]), LEGACY_PERSONAL_LOCAL[os.path.basename(e["path"])])
            legacy_personal.append({"path": e["path"], "rename_to": target,
                                    "rename_to_exists": os.path.lexists(os.path.join(repo_root, target))})
    # Orphan = a docs/** or non-standard doc no AGENTS routing reaches. Root entry
    # docs (README/AGENTS/CLAUDE) are entry points, not routed leaves — never orphans.
    orphans = [e["path"] for e in files
               if not e["reachable_from_agents"]
               and e["classification"] not in ("meta", "canonical-root") + PERSONAL_CLASSES]

    return {
        "repo_root": os.path.abspath(repo_root),
        "private": private,
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
            "legacy_personal": len(legacy_personal),
            "decision_records": decisions["records"],
            "decision_record_facts": sum(len(f["flags"]) for f in decisions["flagged"]) + len(decisions["duplicate_numbers"])
                                     + len(decisions["not_records"]) + len(decisions["replaced_still_present"]),
            "claude_md_ok": claude["canonical"],
        },
        "claude_md": claude,
        "missing_canonical": missing,
        "location_violations": location_violations,
        "injected_blocks": injected,
        "legacy_personal": legacy_personal,
        "orphans": orphans,
        "decisions": decisions,
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
    c = data["claude_md"]
    out.append(f"  {c['file']} == {c['expected']}: {s['claude_md_ok']}  |  location violations: {s['location_violations']}  injected blocks: {s['injected_blocks']}")
    out.append(f"  decision records: {s['decision_records']}  |  shape and tree facts against the contract: {s['decision_record_facts']}")
    if data["missing_canonical"]:
        out.append(f"  MISSING canonical: {', '.join(data['missing_canonical'])}")
    for l in data["legacy_personal"]:
        move = f"merge into {l['rename_to']}, which exists" if l["rename_to_exists"] else f"rename to {l['rename_to']}"
        out.append(f"  LEGACY personal file: {l['path']} (Claude Code never loads it; {move})")
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
        flags.extend((e.get("record") or {}).get("flags", []))
        flagstr = ("  [" + ", ".join(flags) + "]") if flags else ""
        out.append(f"  {e['path']:<34} {tag:<16} lines={m.get('lines','?'):<4} words={m.get('words','?'):<5}{flagstr}")
    t = data["decisions"]
    for d in t["duplicate_numbers"]:
        out.append(f"  DECISIONS: number {d['number']} is on {', '.join(d['paths'])}")
    for p in t["not_records"]:
        out.append(f"  DECISIONS: {p} is in the tree and is no NNNN-slug.md record")
    for r in t["replaced_still_present"]:
        out.append(f"  DECISIONS: {r['path']} replaces {r['replaces']}, and {', '.join(r['still_present'])} is still there")
    out.append("")
    out.append(f"--- AGENTS.md routes ({len(data['agents_routes'])}) ---")
    for r in data["agents_routes"]:
        out.append(f"  L{r['line']:<4} {r['kind']:<12} {r['target']}  {'ok' if r['resolved'] else 'UNRESOLVED'}")
    return "\n".join(out)


def main():
    args = sys.argv[1:]
    fmt = "json"
    brief = False
    positional = []
    for a in args:
        if a.startswith("--format="):
            fmt = a.split("=", 1)[1]
        elif a == "--brief":
            brief = True
        elif a in ("-h", "--help"):
            print(__doc__)
            return
        elif a.startswith("--"):
            print(f"Unknown option: {a}", file=sys.stderr)
            sys.exit(1)
        else:
            positional.append(a)
    if not positional:
        print(
            f"Usage: {os.path.basename(sys.argv[0])} <repo-root> [--format=json|text] [--brief]",
            file=sys.stderr,
        )
        sys.exit(1)
    repo_root = positional[0]
    if not os.path.isdir(repo_root):
        print(f"Error: {repo_root!r} is not a directory", file=sys.stderr)
        sys.exit(1)
    data = build(repo_root)
    if fmt == "text":
        print(format_text(data))
    elif brief:
        # The workflow reads this output back through an agent's Bash tool, which returns
        # only a preview of a large result. The per-file resolved-link lists are most of
        # the bytes and no stage reads them (unresolved_links stays), so --brief drops
        # them and prints compact JSON: a 45-doc repo goes from 132KB to under 20KB.
        for f in data["files"]:
            f.pop("links", None)
        print(json.dumps(data, separators=(",", ":")))
    else:
        print(json.dumps(data, indent=2))


if __name__ == "__main__":
    main()
