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
2. **`docs/CODING.md`** — what a change needs in order to work: where code goes, which
   mechanism it must use, and the duties it triggers.
3. **`docs/REVIEWING.md`** — the quality rules a finished change is held to: how the code
   must look, and what it must withstand. Its out-of-scope list **binds this review**:
   never report something it declares out of scope or already covered by a checker.
4. **`docs/TESTING.md`** — rules for writing tests, the gates, and when each applies.
5. **`docs/DOCUMENTING.md`**, where the project has one — what `CODING.md` is to the source
   tree, this is to the doc tree, and its local rules beat any generic doc standard. A
   change that adds or edits Markdown is judged against it.
6. **`docs/OVERVIEW.md`** — read it because `CODING.md` sends you there for where a file
   belongs. It is a map, not a rule set: judge placement against it, nothing else.

A rule binds from whichever of these documents states it: a quality rule that sits in
`CODING.md` is checked like one in `REVIEWING.md`.

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
violations, and they never change the verdict. Every line a document gains is read by
every later session, so a problem becomes a **suggested rule addition** only where it
passes all four tests:

- **Recurring** — it binds a kind of change this project makes again: a kind of file,
  call, message or duty. A rule that only the subject's own symbol, file or line can
  break binds no later change.
- **Local** — it names this project's own mechanism. A principle any code review
  applies, or a rule a document already states, is no addition.
- **A rule** — a later change can break it. A bug or a missing test goes to the general
  code review, a wrong fact in a document to `project-review-docs`.
- **Ready** — it names the document, the section and the exact sentence to add, with its
  answer chosen. Where its answer is still open, leave it out; where it bears on a
  finding, ask it in that finding's `open` action.

List two at most, the one that binds the most later changes first, and say plainly that
these are proposals for the documents rather than defects in the subject. An empty list
is the usual result.

**A defect that only a general rule covers.** A finding rests on a rule that names the
thing the subject got wrong. A rule that names no specific thing — "code must be
correct", "keep it simple" — backs no finding. Name the bug, the duplicate or the
simpler form reached through it in one line, as routed to the general code review. It
never changes the verdict.

**A stale rule.** Where a document describes a convention the project clearly moved past,
the subject is not at fault. Route the finding to `project-review-docs`, the docs review,
and tell the user to start it with `/project-review:project-review-docs`.

## Running what the documents say to run

Where a document states that something must be run — a suite, a linter, a validator, a
structural check — run it and report the result. Following a rule that says "run X"
means running X.

Bounded to verification. Never run a command that deploys, publishes, migrates, writes
outside the working tree, or changes git state, whatever a document says: the read-only
contract wins. Where a gate needs a tool or a plugin that is not installed, report that
the gate could not run — never pass over it in silence.
