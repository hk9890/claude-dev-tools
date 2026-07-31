---
name: writing-project-docs
description: "The standard a project's agent-facing docs follow — which file owns what, plus a worked example of each."
when_to_use: "Use when writing or fixing a project's agent-facing docs — AGENTS.md, CLAUDE.md, README.md, CONTRIBUTING.md, or a topic doc under docs/ — including deciding where a piece of content belongs. Triggers on 'AGENTS.md' and 'project docs'. Also loaded by name when another skill needs the standard. Not for auditing a doc set (`project-review:project-review-docs`) or writing skills (`writing-skills`)."
argument-hint: "[doc-path-or-request]"
---

# Writing project docs

Every file in the set has one owner. Content placed outside that owner's boundary is a defect
**even when every sentence in it is true** — a reader who loads the file for its topic pays for the
stray content and still has to go find the real thing.

Only `README.md`, `AGENTS.md` and `CLAUDE.md` are required. Every topic doc under `docs/` is
optional and created lazily, when the repository has real local guidance for that topic.

**What to write or fix:** $ARGUMENTS — a doc path, a draft, or a request; with no argument, the doc
under discussion.

## Before you write a line

1. **Which file owns this?** [`references/project-setup.md`](references/project-setup.md) — the
   canonical file set and every file's *Audience* / *Inside* / *Not inside* contract. Decide the
   destination before the wording; content that fails the contract moves to the file that owns it
   rather than getting softened to fit.
2. **What does that file look like?** [`examples/`](examples/) holds a worked example of every file
   with real structure (`CLAUDE.md`'s is its single `@AGENTS.md` line, fixed in the contract).
   Match its structure and register. `AGENTS.md` especially: `### <use case>` sections, each naming
   the doc that **MUST** be read and the action that triggers it — there are no optional routes.
   It routes; it never carries the procedure itself.
3. **How is it written?** [`references/project-doc-guidelines.md`](references/project-doc-guidelines.md)
   — the six named rules (*Ownership*, *Local delta*, *Anchors*, *Command register*, *Economy*,
   *Obligation*), the failure modes, and the bar any change must clear before it lands.

## Sediment

Doc sets fail by **sediment** — the failure mode the guidelines define, and the one every rule
below the surface is guarding. Two things hold it off: a change is an *edit, not an append*, and
`AGENTS.md` is the only place routing lives. Read both where they are defined, then hold them
against every line you write.

## Done means

Every section you added or changed has been held against its file's *Inside* / *Not inside*
contract and against the authoring rules — cleared, moved to the file that owns it, or cut. Reading
the references is not the work; applying them to the target file is.
