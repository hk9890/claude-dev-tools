---
name: writing-project-docs
description: "The standard a project's agent-facing docs follow: which file owns what, plus a worked example of each."
when_to_use: "Use when writing or fixing a project's agent-facing docs (AGENTS.md, CLAUDE.md, README.md, CONTRIBUTING.md, or a topic doc under docs/), including deciding where a piece of content belongs. Triggers on 'AGENTS.md' and 'project docs'. Also loaded by name when another skill needs the standard. Not for auditing a doc set (`project-review:project-review-docs`), writing skills (`writing-skills`), or writing task and issue bodies, a design page the tracker holds included (`tasks:tasks-core`)."
argument-hint: "[doc-path-or-request]"
---

# Writing project docs

Every file in the set has one owner.

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
4. **What holds for any agent-facing document?**
   [`../../references/writing-hygiene.md`](../../references/writing-hygiene.md), at
   `<base directory for this skill>/../../references/` — single source of truth, cache, relevance,
   sediment, no-ops, negation. Shared with `writing-skills`, so it sits at the **plugin root** and
   the `../../` is the layout rather than a mistake. Item 3 is what a project doc *set* adds on top
   of it; both bind.

## Sediment

Doc sets fail by **sediment**, defined in item 4 and the failure every rule below the surface is
guarding. Two things hold it off: a change is an *edit, not an append*, and `AGENTS.md` is the only
place routing lives.

## Done means

Every section you added or changed has been held against its file's *Inside* / *Not inside*
contract, against the authoring rules, and against the hygiene rules — cleared, moved to the file
that owns it, or cut. Reading the references is not the work; applying them to the target file is.
