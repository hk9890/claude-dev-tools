---
name: project-explore
description: "Explore an unfamiliar project step by step, filing findings and open questions as taskmgr tasks under an exploration epic."
user-invocable: true
disable-model-invocation: true
---

Perform an assisted exploratory session on this project. Work through four phases in order. Stop cleanly if a prerequisite is missing — do not proceed to the next phase on an assumption.

$ARGUMENTS

---

## Phase 0 — Task tracker check and epic creation

### 0.1 Verify taskmgr is initialised

Check that taskmgr is usable:

```bash
ls .tasks/ 2>/dev/null && taskmgr list >/dev/null 2>&1
```

If `.tasks/` does not exist or `taskmgr` is not usable, stop immediately and tell the user:

> **taskmgr is not initialised in this repository.** The `project-explore` skill requires a `taskmgr` store to open and track the exploration session. If the `taskmgr` binary is missing, install it first; otherwise run `taskmgr init` in the project root, then re-invoke this skill.

Do not proceed to Phase 1 until taskmgr is confirmed usable.

### 0.2 Create the exploration epic

Create a taskmgr epic for this session:

```bash
taskmgr create --type epic --title "Explore <project-name> — <YYYY-MM-DD>" \
  --description "Assisted exploratory session. Research inline, then one-action-at-a-time exploration loop." \
  --json
```

Capture the epic ID from the `--json` output's `id` field (e.g. `explore-nnkr7e`). IDs are opaque — never invent one. All tasks created during this session are children of that epic.

### 0.3 Confirm scope with the user

Scan `docs/TESTING.md`, `AGENTS.md`/`CLAUDE.md`, and `README.md` for a documented test/scratch/dev environment.

Then open with the epic ID and ask via `AskUserQuestion`:

- If an env is documented: state you'll target it, then ask "focus area or explore freely?".
- If not: ask both "is there a scratch env for mutating actions?" and "focus area or explore freely?".

Record (a) the scratch env (if any) and (b) any focus constraint. Then proceed to Phase 1.

---

## Phase 1 — Research (inline)

Research is done inline here — there is no separate sub-agent.

### 1.1 Open a research task under the epic

```bash
taskmgr create --type task --title "Research: read docs and history" \
  --parent <epic-id> \
  --description "Read project structure, docs, and history to produce the exploration understanding file." \
  --json
```

Capture the research task ID from the `--json` output's `id` field.

### 1.2 Read canonical project docs

Read these in order, stopping when a file is absent rather than guessing:

- `CLAUDE.md` / `AGENTS.md` — routing and agent instructions
- `docs/OVERVIEW.md` — architecture and layout
- `docs/CODING.md` — conventions
- `docs/TESTING.md` — how tests are run
- `README.md` — user-facing description
- Any other files `AGENTS.md` routes to as authoritative

### 1.3 Read history and intent

Read these sources to understand trajectory and risk:

- Open tasks: `taskmgr list -q 'status == "open"'`
- Recently closed: `taskmgr list -q 'status == "closed"' --sort closed --reverse --limit 20`
- GitHub issues (if the project uses GitHub): `gh issue list --state all --limit 30` and `gh issue list --state closed --limit 20`
- `CHANGELOG.md` or `HISTORY.md` if present
- Recent commits: `git log --oneline -20`

### 1.4 Read prior exploration sessions

Each past `project-explore` session leaves an epic titled `Explore <project> — <YYYY-MM-DD>`. Pull recent ones so this session does not re-tread covered ground or re-file known issues.

```bash
taskmgr list -q 'type == "epic"'
```

From the results, keep only exploration epics whose **title date is within the last 14 days**. Ignore older epics — their findings may be stale and the project has likely moved on.

For each recent exploration epic, read its wrap-up summary and its still-open children:

```bash
taskmgr show <recent-epic-id>
taskmgr list -q 'parent == "<recent-epic-id>" && status == "open"'
```

Record, for the understanding file's "Prior exploration" section:

- which areas / flows recent sessions already exercised, and on what date
- finding and question task IDs still open from those sessions

If no exploration epic falls within the last 14 days, note "No recent exploration sessions" and continue.

### 1.5 Write the understanding file

Write the result to a throwaway temp file using the seven-section schema from `references/understanding-template.md`:

```bash
UNDERSTANDING_FILE=$(mktemp --suffix=".md")
# write the filled template to $UNDERSTANDING_FILE
```

The file is ephemeral — do not commit it or attach it to the epic.

### 1.6 Close the research task

```bash
taskmgr close <research-task-id> --reason "done: understanding file written to temp path; research complete"
```

---

## Phase 2 — Exploration loop (one action, then ask)

Read the understanding file. Then enter the loop.

Each iteration is exactly one action. Do not chain or batch actions — pick one, do it, judge it, record it, then stop and ask via `AskUserQuestion`. Silence is not consent.

Load `references/break-it.md` before the first iteration. Use it as instinct-prompting, not a checklist.

### Per-iteration steps

**1. Pick** — choose one thing to exercise. Draw from:
   - A user flow in "User flows discovered"
   - A claim in "Expectations to verify"
   - A fragile area in "Known / likely-fragile areas"
   - A "try to break it" instinct from `references/break-it.md`

   State what you are about to do and why you picked it.

**2. Do** — execute the action. Use the launch patterns appropriate to this project type:

   - **CLI tool**: run the binary or `<tool> --help`, then invoke with realistic arguments
   - **Server / web app**: start with the dev server command (e.g. `npm run dev`, `python manage.py runserver`, `go run .`), then exercise an endpoint or UI path
   - **TUI app**: launch and drive interactively, or drive via stdin if the tool supports it
   - **Library**: write a minimal inline script that imports and calls the library
   - **Script / automation**: run the script with realistic inputs

   Check `docs/TESTING.md` or `AGENTS.md` for project-specific run instructions before trying generic patterns.

   **Mutation safety**: if the action writes, deletes, or sends anything — including creating many records — it is destructive. Before running a destructive action:
   - If a scratch/dev environment was confirmed in Phase 0, target it.
   - Otherwise, stop and ask: "This action will <describe the mutation>. OK to proceed?"
   - Volume actions ("create hundreds of entries") always count as destructive — ask first.

   If the user previously said "do next N without asking": suspend check-ins for non-destructive actions only. Destructive actions always force a stop-and-confirm, even mid-batch.

**3. Judge** — ask yourself three questions and record the answers briefly:
   - Was the result what I expected (based on docs or intuition)?
   - Is this OK for a real user in normal use?
   - What would make it meaningfully better?

**4. Record** — based on the judgment:

   - If something is broken, rough, or behaves contrary to what the docs or the understanding file predicted: file a **finding** task.
   - If something is genuinely unclear and cannot be resolved from the available docs and source: file a **question** task.
   - If the action went as expected with nothing notable: record nothing; move to step 5.

   **Before filing, dedup**: list open epic children and do a title/text check:

   ```bash
   taskmgr list -q 'parent == "<epic-id>" && status == "open"'
   ```

   Also check the open findings and questions from recent sessions recorded in the understanding file's "Prior exploration" section.

   If an existing task — in this epic or a recent prior one — already covers the same issue, add a comment to that task instead of creating a duplicate: `taskmgr comment add <task-id> "<note>"` (use `--file -` to pipe a multi-line note from a heredoc).

   **Filing a finding** (broken or rough behaviour):

   ```bash
   taskmgr create --type bug --label explore:finding --json \
     --parent <epic-id> \
     --title "<short description>" \
     --description-file - <<'HEREDOC'
   What I did: ...
   Expected (source: ...): ...
   Actual: ...
   Severity: ...
   Repro: ...
   HEREDOC
   ```

   **Filing a question** (genuine ambiguity):

   ```bash
   taskmgr create --type task --label explore:question --json \
     --parent <epic-id> \
     --title "<short question>" \
     --description-file - <<'HEREDOC'
   Context: ...
   What I observed: ...
   Why this is unclear: ...
   HEREDOC
   ```

   Capture the filed task's ID from the `--json` output's `id` field — report it in step 5 and list it in the Phase 3 wrap-up.

**5. Check in** — report briefly:
   - What you did
   - What you found (or "nothing notable")
   - Any task ID filed

   Then **stop and call `AskUserQuestion`** with: "Iteration <N> done. Continue, redirect, or stop?" and options "Continue — next action" / "Redirect — go deeper on …" / "Stop — wrap up".

   Do not advance until the user's answer arrives. **Silence is not consent.**

   **Anti-pattern:** ending with prose like "I'll proceed unless you redirect" or writing the three options as plain text. The only ways to advance are an explicit user answer via `AskUserQuestion` or an opt-out phrase.

   **Opt-out:** "do next N without asking", "keep going, don't ask", or "explore freely until I stop you" — skip `AskUserQuestion` for non-destructive iterations only. Destructive actions still stop-and-confirm per step 2.

---

## Phase 3 — Wrap-up

When the user says "stop" or when the session ends naturally, post a summary comment on the epic.

```bash
cat << 'HEREDOC' | taskmgr comment add <epic-id> --file -
...
HEREDOC
```

The summary must include:

1. **Actions tried** — a brief list of what was exercised
2. **Tasks filed** — finding IDs and question IDs, each with a one-line description
3. **Coverage and limits** — an explicit note on what was NOT explored and why (time, access, scope focus, etc.)

Do not write "all good" or "no issues found". If nothing was filed, write "No findings or questions filed during this session — coverage was limited to: <list>."

The epic and its child tasks are the deliverable. They remain open for normal triage.
