# Planning Intake Decision Logic

Applies when `/beads-tasks:beads-plan` is invoked. Invocation IS the declaration of planning intent — there is no discussion or exploration branch. The only question is whether enough context already exists in the conversation to proceed.

## Section 1: Decision algorithm

Scan the conversation for the following signals before asking any questions.

**Sufficient context — proceed to planning immediately if any of these are present:**

- A feature, improvement, or change the user wants to build, described with enough specificity to write a ticket title and description
- A bug or problem to fix, with observable symptoms or reproduction steps
- An explicit scope statement ("rewrite X", "add Y to Z", "fix the issue where…")
- Both what-to-build AND what-done-looks-like are already answerable from the conversation

**Insufficient context — ask questions when these are missing:**

- What to build or fix is vague or absent
- The desired outcome is unclear
- There is no basis yet for writing testable acceptance criteria

If the conversation already provides sufficient context, skip Section 2 entirely and proceed to planning.

## Section 2: Intake questions

Ask only the questions whose answers are not already present in the conversation. Do not ask questions whose answers are already clear from context.

1. What do you want to build or fix? *(scope — required)*
2. What is the desired outcome, or what problem does this solve? *(required)*
3. Are there known constraints, files, or systems involved? *(optional — ask only if scope is still ambiguous after questions 1 and 2)*
4. How would you verify it works — what does "done" look like? *(optional — ask if acceptance criteria cannot be inferred; the answer should satisfy the planner quality bar in [references/planning.md](planning.md))*

## Section 3: When to stop asking

Stop asking as soon as questions 1 and 2 are answered with enough specificity that a ticket description can be written. At that point, proceed to planning immediately — do not ask further questions.
