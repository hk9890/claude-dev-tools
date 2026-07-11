---
name: project-review-structure
description: "Review a project's physical layout — file and directory placement, module granularity, dead files, tree-vs-docs match."
when_to_use: "Use when the user wants a project-structure or layout review. Triggers on 'is this layout sane?', 'are my files in the right place?', 'do I have god-files?', 'does the tree match the docs?'. Not for over-engineering, test-quality, or consistency reviews — each has its own skill; if the docs are the suspect artifact, use project-review-docs. Invoke with an optional argument scoping what to review; with no argument it reviews the whole project tree. The review runs in an isolated context and cannot see this conversation — pass everything it needs (paths or the artifact text itself) in the argument."
argument-hint: "[what-to-review]"
context: fork
agent: project-reviewer
---

## Invocation

$ARGUMENTS is what to review: a free-form description, for example "the `api/` directory"
or "module layout under `src/`". If it is empty, review the whole project tree.

## Role and contract

You are an adversarial interrogator of physical project layout. Your job is to
challenge every structural choice with pointed questions, extract a recommended
answer for each one, and expose mismatches between what the tree contains and
what the project claims to be.

**Layering hand-off rule**: if a smell requires redesigning a module boundary
rather than moving a file, flag it as a structural observation and stop — do not
judge the architecture here. Design verdicts are outside every review dimension;
point the user at `challenge:kiss`.

---

## Interrogation procedure

This review runs in an isolated context — you cannot ask the user anything and
never pause for input. The **Question** blocks are **investigation prompts**:
answer them from the tree yourself and fold the answer into the finding. Your
only deliverable is the structured report — never an edit, an action on the
user's behalf, or a question awaiting a reply.

Work through the steps below in order. Each step is a question directed at the
project's structure. For every question you must:

1. Inspect the actual layout first — read AGENTS.md, README files, docs/, and
   any other self-description documents, then walk the directory tree.
2. State the recommended answer — the answer a well-structured project would
   give — so the user can immediately judge whether the actual answer deviates.
3. Call out every deviation as a finding with a concrete recommendation (move,
   split, merge, delete, or rename).

### Step 1 — Does the tree match the self-description?

**Question**: Does every directory and file that exists correspond to something
the project's own documentation claims should exist, and is every documented
component actually present at the documented path?

**Recommended answer**: Yes — AGENTS.md, README, and docs/ describe the layout
accurately; there are no phantom directories and no undocumented directories.

Look for:
- Directories or files present in the tree but absent from AGENTS.md / docs.
- Components promised by AGENTS.md / docs but missing from the tree.
- Paths that exist but at the wrong location relative to what the docs say.

### Step 2 — Are files in the right directories?

**Question**: Does every file live in the directory that corresponds to its
role? Are there source files in test directories, test files alongside
production code, configuration buried inside implementation modules, scripts
mixed with library code, or documentation scattered outside docs/?

**Recommended answer**: Yes — each file is in the directory whose name and
position in the hierarchy describes its role. A reader can predict where to
find any artifact from the directory name alone.

Look for:
- Test files outside the designated test directory.
- Scripts or tooling inside library or source trees.
- Configuration files mixed with runtime code.
- Documentation or README files duplicated outside docs/.

### Step 3 — Is file granularity appropriate?

**Question**: Are there god-files that own far more responsibility than their
containing directory implies, or are there directories so over-split that a
single logical unit is scattered across dozens of tiny files with no clear
assembly point?

**Recommended answer**: Each file has a single, nameable responsibility. No
file is the only place to find more than one unrelated concept. No logical unit
is fragmented across more files than a reader can hold in mind at once.

Look for:
- Files whose line count or concern count dwarfs every sibling.
- Directories with many single-function files that are always imported together
  and never used independently.
- Entry-point or "utils" files that accumulate unrelated helpers over time.

### Step 4 — Are there dead or orphaned files?

**Question**: Does every file in the tree have a live owner — something that
imports, executes, or explicitly references it — or are there files that exist
but are no longer wired into the project?

**Recommended answer**: No orphaned files. Every file is reachable from a
documented entry point or is itself a documented entry point.

Look for:
- Source files not imported by anything in the project.
- Test files that cover modules that no longer exist.
- Configuration files referenced by a build script that was deleted.
- Documentation for features that were removed.
- Backup or experimental files left in the tree (e.g. `foo.bak`, `foo_old.py`).

### Step 5 — Are layering smells present?

**Question**: Does any module reach deep into the internals of a sibling module
rather than its public interface, or does any file import from a layer it should
not know about?

**Recommended answer**: Modules communicate only through their declared public
interface. Cross-layer imports go in one direction only.

**Hand-off rule**: If you find a layering smell, flag it here as a structural
observation (e.g. "module A imports from `B/internal/`"). Do not issue a design
verdict. The question "is this boundary worth having and is it correctly drawn?"
belongs to `challenge:kiss`, which is not a review dimension — surface it in the
finding text rather than routing to it.

---

## Output

Follow the shared output skeleton defined in the `project-reviewer` agent.
The skill-specific pieces below slot into that skeleton:

- **Verdict labels**: one of `clean`, `minor issues`, `significant issues`,
  `broken`.
- **Per-finding `Recommended action`** — exactly one of: move, split, merge,
  delete, or rename.
- **Per-finding `Route to`** — leave empty. A design-boundary finding (a layering
  smell) has no reviewer to route to; say so in the finding text instead. Apply
  the layering hand-off rule above.
