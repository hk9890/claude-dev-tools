---
name: tasks-writing
description: "The standard a task body clears before it is filed: which type carries the work, what each section owns, and the rules the store's gate enforces."
when_to_use: "Use when writing, splitting, or repairing the body of a task, issue, or ticket: its type, priority, sections, or acceptance criteria, a `doc` issue such as a design page or handover the tracker holds included. Triggers on 'write a task', 'acceptance criteria', 'is this ticket clear enough'. Not for project docs (`instruction-writing:writing-project-docs`) or skills (`instruction-writing:writing-skills`); to file a whole conversation as a task set, point the user at `/tasks:tasks-create`."
argument-hint: "[task-or-draft]"
---

# Writing tasks

**What to write or fix:** $ARGUMENTS — a draft, a task id, or a finding; with no argument, the task
under discussion.

## 1. Read the standard

```bash
taskmgr guide filing
taskmgr guide pkg:task-writing:types
```

## 2. Hold the draft against it

Rewrite the body until every rule and every completion test those commands printed clears.
