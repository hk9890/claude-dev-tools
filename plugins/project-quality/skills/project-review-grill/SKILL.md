---
name: project-review-grill
description: "Adversarially grill a plan, design, or piece of work — pointed questions walked through with you one at a time."
when_to_use: "Use when the user wants a plan, design, or approach challenged before committing. Triggers on 'grill me on this', 'poke holes in this design', 'challenge this plan', 'what am I missing?'. Produces an interactive walkthrough, not a report. Not for code/PR or architecture reviews."
argument-hint: "[what-to-grill]"
---

# Grill a plan, design, or piece of work

Challenge the target adversarially: generate a sheet of pointed questions — each with a committed
recommended answer and a source — then walk them with the user one at a time. This is a discussion;
it never writes to a tracker or edits the project.

What to grill: $ARGUMENTS

If no argument is given, grill the plan/design/work currently under discussion in the conversation.

## 1. Generate the grill sheet (delegate to the reviewer)

Use the **Task tool with `subagent_type: project-quality:project-reviewer`** to launch the reviewer.
This skill is deliberately **not** forked — do not copy the `context: fork` / `agent:` frontmatter the
dimensional review skills use. You run in the main loop and spawn the reviewer yourself, so you can
walk its result interactively afterwards.

Instruct the reviewer to **grill** the target (the word "grill" activates its grill mode — see
`agents/project-reviewer.md`, "Grill mode"). It runs in an isolated context that cannot see this
conversation, so include in the prompt the target description and any plan/design detail that exists
only here. Ask it to return:

- an ordered list of `Q<n>` entries, each with `Recommended answer`, `Why it matters`, and `Source`;
- a final `grill-status: clean | needs-answers` line.

The reviewer explores the codebase and docs before producing the sheet.

## 2. Walk the sheet with the user — one question at a time

Do **not** dump the whole sheet. For each question, in order:

1. Present the question, the reviewer's recommended answer, and the source.
2. Ask via `AskUserQuestion` with three options — **Accept** (take the recommended answer),
   **Override** (the user gives their own answer), **Defer** (decide later). On **Override**, capture
   the user's free-text answer as a follow-up and record *that text* as the decision, not just the
   "Override" label.
3. Record the resolved decision before moving to the next question.

Scope and architecture questions come first. After each such decision, restate which downstream
questions it makes moot and tell the user you are dropping them (and why) before continuing — never
skip a question silently.

## 3. Wrap up

Summarize the resolved decisions and any that were deferred, then branch on the reviewer's gate:

- `grill-status: needs-answers` — confirm every blocking question was resolved; if any remain open,
  list them and say the plan is **not** ready yet.
- `grill-status: clean` — say so.

If the resolved decisions imply concrete work and a task-creation skill is available (e.g.
`tasks:tasks-create`), suggest the user run it to capture that work — do not create tasks yourself.
