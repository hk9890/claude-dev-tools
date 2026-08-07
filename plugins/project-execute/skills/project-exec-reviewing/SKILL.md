---
name: project-exec-reviewing
description: "Review a change the way the project itself defines it."
user-invocable: true
disable-model-invocation: true
argument-hint: "[what-to-review]"
---

**Review the change.** Scope: $ARGUMENTS

Follow the project's own review rules exactly. Do not invent criteria, checklists, or severity scales — if the project defines no review rules, do nothing and report that reviewing is not configured for this project. Rules count as defined only if stated in the project's docs (CLAUDE.md/AGENTS.md routing, README) or config (review checklists, CI review gates); check those before reporting not configured.

A project states only its local delta and routes the rest to a general review skill or checklist. Follow that route where it exists, and let the local rules win wherever the two conflict.

With no scope, review the changes on the current branch against the branch it was cut from.

If the project offers more than one review path and the scope above does not settle which, ask the user — do not assume.

This skill is read-only — it reviews, it never fixes what it finds.

Report faithfully: what was reviewed, each finding with its evidence and the project rule behind it, and anything skipped.
