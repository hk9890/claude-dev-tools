---
name: tasks-writing
description: "The standard a task follows before it is filed — which type carries it, what each body section owns, and a worked example of every type."
when_to_use: "Use when writing, splitting, or repairing the text of a task, issue, or ticket — its type, priority, body, or acceptance criteria. Triggers on 'write a task', 'acceptance criteria', 'is this ticket clear enough'. Also loaded by name when another skill needs the standard. Not for project docs (`instruction-writing:writing-project-docs`) or skills (`instruction-writing:writing-skills`); to file a whole conversation as a task set, point the user at `/tasks-create`."
argument-hint: "[task-or-draft]"
---

# Writing tasks

A task is read **cold**. Whoever executes it — a colleague next month, an agent with no transcript —
has your words and the repository, nothing else.

A task that names a wanted end-state but no executable path is a **wish**. Wishes file cleanly and
read fine, and they cost the implementer a round trip before any work starts. They are the default
failure, not a rare one.

**What to write or fix:** $ARGUMENTS — a draft, a task id, or a finding; with no argument, the task
under discussion.

## Before you write a line

1. **Which type carries this?** [`references/task-types.md`](references/task-types.md) — the five
   types, each with its *Use when* / *Inside* / *Not inside* contract, plus the priority scale. The
   *nature* of the work picks the type; where it was discovered picks nothing.
2. **What goes in the body?** [`references/task-anatomy.md`](references/task-anatomy.md) — the four
   sections every task carries, what each one owns, and the six rules (*Cold start*, *One problem*,
   *Evidence*, *Testable done*, *Smallest change*, *Economy*) a body must clear.
3. **What does a finished one look like?** [`examples/`](examples/) — a worked example per type.
   Match the register: short declarative sentences, real paths, real commands, pasted output.
   `epic.md` is the deliberate deviation — an epic carries an outcome and children, never an
   implementation.

## The wish test

Read the draft as the cold reader and answer two questions: *where do I start?* and *how will I know
I am done?* Answer both from the page alone. An answer that lives in your head, in the conversation
that produced the task, or in "the author will know" means the task is a wish — repair it before
filing.

## Done means

Every section has been held against its owner's contract and the six rules — cleared, rewritten, or
cut — and the wish test answered from the page. Reading the references is not the work; applying
them to the task is.
