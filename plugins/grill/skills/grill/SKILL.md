---
name: grill
description: "Adversarially stress-test a plan, design, change, or decision — pointed questions, each with a committed recommended answer and source, walked with you one at a time and gated clean or needs-answers."
when_to_use: "Use when the user wants a plan, design, change, decision, or idea challenged before committing — 'grill me on this', 'poke holes in this', 'challenge this plan', 'stress-test this approach', 'what am I missing?', 'talk me out of this'. Produces an interactive question-by-question walkthrough, not a written report. Not a code/PR or whole-project audit — for those, use the project-quality reviews."
argument-hint: "[what-to-grill]"
---

# Grill — adversarial stress-test

Challenge the target adversarially: spawn the challenger to generate a sheet of pointed
questions — each with a committed recommended answer and a source — then walk them with
the user one at a time and close on a gate. This is a discussion; it never writes to a
tracker or edits anything.

What to grill: $ARGUMENTS

The target can be anything: a plan, a design, a diff or PR, a decision, or a bare idea
under discussion. If no argument is given, grill the plan/design/work currently under
discussion in the conversation.

## 1. Generate the grill sheet (delegate to the challenger)

Spawn the challenger with the **Task tool, `subagent_type: grill:challenger`**. This
skill runs in the **main loop** — not forked — so it can walk the sheet interactively
after the challenger returns.

The challenger runs in an isolated context that cannot see this conversation. In its
prompt, include:

- the target description and any plan/design detail that exists only here;
- the absolute path to the value base so it can ground its answers. Locate it by
  searching both the install and the current checkout, with a glob that tolerates the
  versioned cache layout (`…/grill/<version>/skills/…`):

  ```bash
  PRINCIPLES="$(find "$HOME/.claude/plugins" "$PWD" -path "*grill*/skills/grill/references/principles.md" 2>/dev/null | sort -V | tail -1)"
  ```

  If `$PRINCIPLES` is a real file, pass that absolute path and tell the challenger to
  read it before forming positions. If it is **empty**, fail loud: tell the challenger
  the value base could not be located, so it grills from its own judgment *and says so*
  in the sheet — never pass a path you did not confirm exists.

Ask it to return an ordered list of `Q<n>` entries — each with `Recommended answer`,
`Why it matters`, `Source`, and `Blocking: yes | no` — and a final
`grill-status: clean | needs-answers` line.

If a project is present, the challenger explores the code and docs before producing the
sheet; if the target is a bare idea, it grills against the value base alone.

If the returned sheet has no `grill-status:` line, treat the gate as `needs-answers` —
never assume clean from a malformed sheet.

## 2. Walk the sheet with the user — one question at a time

Do **not** dump the whole sheet. For each question, in order:

1. Present the question, the challenger's recommended answer, and the source.
2. Ask via `AskUserQuestion` with three options — **Accept** (take the recommended
   answer), **Override** (the user gives their own), **Defer** (decide later). On
   **Override**, capture the user's free-text answer as a follow-up and record *that
   text* as the decision, not just the "Override" label.
3. Record the resolved decision before moving to the next question.

Scope and architecture questions come first. After each such decision, restate which
downstream questions it makes moot and tell the user you are dropping them (and why)
before continuing — never skip a question silently.

## 3. Wrap up

Summarize the resolved decisions and any that were deferred, then branch on the gate:

- `grill-status: needs-answers` — confirm every question marked `Blocking: yes` was
  resolved (accepted or overridden — a deferred blocking question counts as open); if
  any remain open, list them and say the work is **not** ready yet.
- `grill-status: clean` — say so.

If the resolved decisions imply concrete work and a task-creation skill is available
(e.g. `tasks:tasks-create`), suggest the user run it to capture that work — do not
create tasks yourself.
