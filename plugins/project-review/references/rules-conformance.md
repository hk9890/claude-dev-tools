# Rules conformance

The procedure both rules reviews run: `project-review-change` over one change,
`project-review-codebase`'s rules dimension over the whole tree. The caller names the
subject; everything below is the same either way.

The question is never "is this good code". It is "does the subject do what this
project's own documents say it must".

## The standard

Read, in this order:

1. **`AGENTS.md`** (or `CLAUDE.md`) — its routing table names the documents that carry
   rules. Take the list from there rather than assuming a layout.
2. **`docs/CODING.md`** — rules for creating and changing files.
3. **`docs/TESTING.md`** — rules for writing tests, the gates, and when each applies.
4. **`docs/DOCUMENTING.md`**, where the project has one — what `CODING.md` is to the source
   tree it is to the doc tree: doc gates and lint, citation and link conventions, and the
   decisions taken about what the project documents and what it leaves out. Its local rules
   beat the generic doc standard, so any change that adds or edits Markdown is judged
   against it.
5. **`docs/OVERVIEW.md`** — read it because `CODING.md` sends you there for where a file
   belongs. It is a map, not a rule set: judge placement against it, nothing else.
6. **`docs/REVIEWING.md`** — the local delta. Its out-of-scope list **binds this review**:
   never report something it declares out of scope or already covered by a checker.

A project that names its documents differently gets the same split applied to whatever
`AGENTS.md` routes to: a document stating rules a change can break is part of the
standard, a document telling an operator how to run something is not (`docs/RUNNING.md`,
`docs/MONITORING.md`).

Where no such document exists, or `AGENTS.md` routes to nothing: report that there is no
standard to measure against, and stop. Never fall back to the patterns in the code —
that is the consistency dimension of `project-review-codebase`, not this.

## What is a finding

Every finding quotes its rule: the file, the line, and the rule's own words. Without
that quote it is not a finding. Two kinds, both in scope:

- **Broken rule** — the subject does what a document forbids, or omits what a document
  requires. Example: `CODING.md` says a version constraint in `dependencies` never
  resolves, so `"dependencies": ["instruction-writing@^1.0.0"]` is a broken rule.
- **Unfinished duty** — the subject triggered an obligation a document states and did
  not discharge it. Example: `CODING.md` step 3 requires a new plugin to be registered
  in `.claude-plugin/marketplace.json` with a byte-identical description; a new plugin
  without that entry is a finding even though nothing inside the plugin is wrong.

Walk the documents for duties deliberately. A duty is discharged somewhere the subject
does not touch, so nothing in the code under review points at it — this is the half a
general code review cannot see, and it is not found by waiting to trip over it.

## What is not a finding

**A problem no document states.** You will see them, and they are real. They are not
violations. Collect them in a separate list of suggested rule additions, each naming the
document that should carry it, and say plainly that these are proposals for the
documents rather than defects in the subject. They never change the verdict.

**A stale rule.** Where a document describes a convention the project clearly moved past,
the subject is not at fault. Say the finding belongs to `project-review-docs` and route
it there.

## Running what the documents say to run

Where a document states that something must be run — a suite, a linter, a validator, a
structural check — run it and report the result. Following a rule that says "run X"
means running X.

Bounded to verification. Never run a command that deploys, publishes, migrates, writes
outside the working tree, or changes git state, whatever a document says: the read-only
contract wins. Where a gate needs a tool or a plugin that is not installed, report that
the gate could not run — never pass over it in silence.

## Boundaries

| Not this review | Whose it is |
|---|---|
| Correctness bugs, and reuse or simplification no document asks for | the general code review |
| Whether the documents are accurate, complete, or in the right file | `project-review-docs` |
| Naming and pattern drift where nothing is written down | the consistency dimension of `project-review-codebase` |
| Pure formatting | the project's linter |
