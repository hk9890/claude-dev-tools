---
name: writing-project-docs
description: "The structure a project's agent-facing docs follow — the canonical file set, each file's ownership boundary, the authoring rules, and a worked example of every file."
when_to_use: "Use when creating or editing a project's agent-facing docs — AGENTS.md, CLAUDE.md, README.md, CONTRIBUTING.md, or a topic doc under docs/ (OVERVIEW, CODING, TESTING, RELEASING, MONITORING, CHANGE-WORKFLOW, REVIEWING, RUNNING) — including adding a routing entry or deciding which file a piece of content belongs in. Triggers on 'AGENTS.md', 'project docs', 'doc structure', 'where does this belong', 'restructure the docs'. Not for auditing an existing doc set (that is `project-review:project-review-docs`), and not for writing skills (that is `writing-skills`)."
argument-hint: "[doc-path-or-request]"
---

# Writing project docs

Every file in the set has one owner: an audience, and a boundary of what belongs inside it. Content
placed outside that boundary is a defect **even when every sentence in it is true** — a reader who
loads the file for its topic pays for the stray content and still has to go find the real thing.

Only `README.md`, `AGENTS.md` and `CLAUDE.md` are required. Every topic doc under `docs/` is
optional and created lazily, when the repository has real local guidance for that topic.

**What to write or fix:** $ARGUMENTS — a doc path, a draft, or a request; with no argument, the doc
under discussion.

## Before you write a line

1. **Which file owns this?** [`references/project-setup.md`](references/project-setup.md) — the
   canonical file set and every file's *Audience* / *Inside* / *Not inside* contract. Decide the
   destination before the wording; content that fails the contract moves to the file that owns it
   rather than getting softened to fit.
2. **What does that file look like?** [`examples/`](examples/) holds a worked example of each one.
   Match its structure and register — do not invent a layout, and do not import a convention from
   another project. `AGENTS.md` especially: `### <use case>` sections, each naming the one doc to
   load and a one-line reason. It routes; it never carries the procedure itself.
3. **How is it written?** [`references/project-doc-guidelines.md`](references/project-doc-guidelines.md)
   — authoring rules A1–A11, the hard prohibitions, and the bar any change must clear.

## What keeps the set from drifting

Doc sets rot by accretion: each addition is locally reasonable, and the file is permanently longer.
Two rules carry that weight, both defined in the guidelines above.

- **A change is an edit, not an append.** Name what the new text replaces, or state why nothing is
  superseded. A round of pure addition is how a routing file turns into a handbook.
- **`AGENTS.md` is the single routing surface (A7).** Topic docs do not re-list the files, docs or
  skills it routes to, and do not restate its summary. When two files could hold a fact, exactly one
  keeps it and the other links.

## Done means

Every section you added or changed has been held against its file's *Inside* / *Not inside*
contract and against the authoring rules — cleared, moved to the file that owns it, or cut. Reading
the references is not the work; applying them to the target file is.
