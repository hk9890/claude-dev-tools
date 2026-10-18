---
name: writing-project-docs
description: "The standard for a project's agent-facing docs: which file owns what, with a worked example of each."
when_to_use: "Use when writing or fixing project docs (AGENTS.md, CLAUDE.md, README.md, CONTRIBUTING.md, a doc under docs/) or deciding where content belongs. Also loaded by name when another skill needs the standard. Not for auditing a doc set (`project-review:project-review-docs`), skills (`writing-skills`), or task and issue bodies, tracker-held design pages included (`tasks:tasks-core`)."
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
   Match its structure and register.
3. **How is it written?** [`references/project-doc-guidelines.md`](references/project-doc-guidelines.md)
   — the six named rules (*Ownership*, *Local delta*, *Anchors*, *Command register*, *Economy*,
   *Obligation*), the failure modes, and the bar any change must clear before it lands.
4. **What holds for any agent-facing document?**
   [`../../references/writing-hygiene.md`](../../references/writing-hygiene.md), at
   `<base directory for this skill>/../../references/` (the `../../` is the layout, not a
   mistake) — single source of truth, cache, relevance, sediment, no-ops, negation.

## Done means

Every section you added or changed has been held against its file's *Inside* / *Not inside*
contract, against the authoring rules, and against the hygiene rules — cleared, moved to the file
that owns it, or cut. Reading the references is not the work; applying them to the target file is.
