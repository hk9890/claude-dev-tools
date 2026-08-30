---
name: tasks-writing
description: "The standard a task follows before it is filed: which type carries it, what each body section owns, and the rules the store's gate holds it to."
when_to_use: "Use when writing, splitting, or repairing the text of a task, issue, or ticket: its type, priority, body, or acceptance criteria, including a `doc` issue such as a design page or handover the tracker holds. Triggers on 'write a task', 'acceptance criteria', 'is this ticket clear enough'. Also loaded by name when another skill needs the standard. Not for a document that lives in the repository: project docs (`instruction-writing:writing-project-docs`) or skills (`instruction-writing:writing-skills`); to file a whole conversation as a task set, point the user at `/tasks:tasks-create`."
argument-hint: "[task-or-draft]"
---

# Writing tasks

The standard is not written here. `taskmgr` prints it, and the store you are filing into prints its
own additions to the same text — so what you read is what that store's gate will refuse you for.

**What to write or fix:** $ARGUMENTS — a draft, a task id, or a finding; with no argument, the task
under discussion.

## 1. Check the tool is there

```bash
command -v taskmgr >/dev/null 2>&1 || echo "STOP: taskmgr is not on PATH"
```

A `STOP` line means the standard is unavailable on this machine: say so and write nothing. Run
nothing below it.

## 2. Print the standard

```bash
taskmgr guide filing                    # the sections a body carries, and what the gate refuses
taskmgr guide pkg:task-writing:types    # which type carries the work, the rules, the wish test
```

The second topic exists only where the `task-writing` package is installed. `taskmgr guide --list`
names the topics this store actually has, and any other `pkg:` topic it lists is this store's
convention and binds too.

Work only from what those commands print. Never from another memory of the standard, and never from
a section or rule you assume exists.

## 3. Hold the draft against it

Take each section of the body and each rule the guide states, and clear it, rewrite it, or cut it.
Where the guide names a template to start from, use the command it gives for finding it: a package
cannot state its own install path, so the path has to be asked for rather than assumed.

## Done means

Every section held against its contract, every rule the guide states applied, and the guide's own
completion test answered from the page alone. Reading the guide is not the work. Applying it to the
task in front of you is.
