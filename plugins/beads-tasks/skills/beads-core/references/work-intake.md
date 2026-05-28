# Work Intake Decision Logic

Contract:

1. Determine what to work on — from conversation context first, from the tracker second.
2. Propose the work back to the user.
3. Get explicit confirmation before any `bd update --status=in_progress`, status change, or tasker/verifier spawn — **unless** the work was authored or approved by the user in this same conversation (the conversation-referenced path in Section 2A and the user said "go" / "work on it" / equivalent already). In that case, restate the plan in one sentence and proceed.

## Section 1: Decision algorithm

Scan the conversation for signals before running `bd ready`.

**Conversation-referenced work — go to Section 2A if any of these are present:**

- The user named specific beads IDs (e.g. "let's work on bd-42", "continue with the auth tasks")
- The conversation just created or discussed an epic/task and the natural next step is to execute it
- The user is resuming work that was clearly in progress earlier in this session

**No clear reference — go to Section 2B when:**

- The conversation does not reference specific tracker work
- The user invoked the skill cold ("let's get to work", "what's next") without prior task context
- It is ambiguous which of several discussed items the user wants to act on

## Section 2A: Propose conversation-referenced work

List the specific epics/tasks the conversation points to. For each, run `bd show <id>` to confirm:

- The issue exists and is open/in_progress
- It is not blocked or labeled `needs:discussion` / `has:open-questions`
- Its acceptance criteria are testable

Present the proposed work list to the user with one-line summaries and ask for confirmation before proceeding.

If a referenced task is blocked or unready, surface that to the user and ask how to proceed — do NOT silently fall through to `bd ready`.

## Section 2B: Discover from the tracker

When the conversation does not point at specific work:

1. Run `bd list --status=in_progress` to find anything already claimed.
2. For each in_progress task, run `bd show <id>` and check the latest comment for blocker indicators.
3. If a task has a blocker comment, surface it to the user with options (resume / skip / mark blocked) — do NOT auto-resume.
4. Run `bd ready` to find unblocked open work.
5. Present a proposal: which in_progress task(s) to resume and/or which ready task(s) to pick up next.

## Section 3: Confirm before acting

Before any tracker mutation or agent spawn, present the proposed work plan:

- The task(s) to be claimed or resumed (IDs + titles)
- The agent type that will execute each (tasker for implementation, verifier for acceptance review)
- Whether tasks will run in parallel or sequentially

Get explicit confirmation ("yes", "go", "do it") before:

- Running `bd update <id> --status=in_progress`
- Spawning any tasker, reviewer, or verifier
- Making any other tracker write

**Exception — conversation-authored work:** If the user just authored and approved
the epic/task(s) in this same conversation and the natural next step is to execute
them, you already have confirmation. Restate the plan in one sentence and proceed —
do not ask a second time.

If the user requests a different selection or different ordering, revise and re-propose. Do NOT start partial work and then ask.

Once confirmed, hand off to the **Execution loop** in [execution-orchestration.md](execution-orchestration.md).
