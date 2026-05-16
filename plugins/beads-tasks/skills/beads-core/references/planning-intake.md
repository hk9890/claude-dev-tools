# Planning Intake Decision Logic

Contract:

1. Understand what the user wants to build before creating anything.
2. Propose a concrete plan back to the user.
3. Get explicit confirmation before any `bd create`, `bd update`, or `bd dep add`.

## Section 1: Decision algorithm

Scan the conversation for signals before asking any questions.

**Clear intent — proceed to Section 3 (propose) directly if all of these are present:**

- A feature, improvement, change, or bug the user wants addressed, described with enough specificity to write a ticket title and description
- A desired outcome or "done" state that can become testable acceptance criteria
- No unresolved open questions that would block a tasker from executing

**Unclear intent — go to Section 2 (discuss) when any of these are true:**

- What to build or fix is vague or absent
- The desired outcome is unclear
- There is no basis yet for writing testable acceptance criteria
- The conversation contains conflicting directions or unresolved decisions

## Section 2: Discussion branch

When intent is unclear, enter a focused discussion with the user. Do NOT create any beads issues during this phase.

Ask only the questions whose answers are not already present in the conversation:

1. What do you want to build or fix? *(scope — required)*
2. What is the desired outcome, or what problem does this solve? *(required)*
3. Are there known constraints, files, or systems involved? *(optional — ask only if scope is still ambiguous after questions 1 and 2)*
4. How would you verify it works — what does "done" look like? *(optional — ask if acceptance criteria cannot be inferred; the answer should satisfy the planner quality bar in [planning.md](planning.md))*

Stop asking as soon as questions 1 and 2 are answered with enough specificity that a ticket description can be written. Then proceed to Section 3.

If the user wants to brainstorm or explore options before committing to a shape, stay in discussion. Do not jump to proposing a plan until the user signals readiness ("ok, let's plan this", "go ahead", a concrete scope statement, etc.).

## Section 3: Propose and confirm

Before any `bd create`, present the proposed plan to the user:

- The epic title and outcome (or, for small work, the standalone task title)
- The list of implementation tasks with one-line summaries
- The acceptance-review task
- Any dependencies or known blockers

Get explicit confirmation ("yes", "go ahead", "create them") before writing to the tracker. If the user requests changes, revise and re-propose — do NOT partially create issues and then ask.

Once confirmed, hand off to the **Planning Workflow** in [planning.md](planning.md) to do the actual `bd create` calls.
