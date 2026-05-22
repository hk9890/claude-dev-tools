---
name: explore-project
description: "Research the project and explore it one action at a time, filing findings and questions as beads tasks under a dedicated exploration epic."
user-invocable: true
---

Perform an assisted exploratory session on this project. Work through four phases in order. Stop cleanly if a prerequisite is missing — do not proceed to the next phase on an assumption.

$ARGUMENTS

---

## Phase 0 — Beads check and epic creation

### 0.1 Verify beads is initialised

Check that beads is usable:

```bash
ls .beads/ 2>/dev/null && bd list >/dev/null 2>&1
```

If `.beads/` does not exist or `bd` is not usable, stop immediately and tell the user:

> **beads is not initialised in this repository.** The `explore-project` skill requires beads to open and track the exploration session. Run `bd init` in the project root, then re-invoke this skill.

Do not proceed to Phase 1 until beads is confirmed usable.

### 0.2 Create the exploration epic

Create a beads epic for this session:

```bash
bd create --type epic --title "Explore <project-name> — <YYYY-MM-DD>" \
  --description "Assisted exploratory session. Research inline, then one-action-at-a-time exploration loop."
```

Capture the epic ID (e.g. `proj-abc`). All tasks created during this session are children of that epic.

### 0.3 Confirm scope with the user

First, check whether the project already documents a test, scratch, staging, or dev environment. Scan `docs/TESTING.md`, `AGENTS.md` / `CLAUDE.md`, and `README.md` for any mention of one (e.g. a staging URL, a sandbox account, a `dev` profile, a test database).

- **If the docs name an environment for mutating actions**, do not ask question 1 — state what you will use and why:

  > I've opened epic `<epic-id>` — **Explore <project> — <date>**. `docs/TESTING.md` documents `<environment>` for testing, so I'll target that for any actions that mutate state.
  >
  > One question before I start researching: is there a particular area or feature you want me to focus on, or should I explore freely?

- **If the docs do not mention one**, ask both questions:

  > I've opened epic `<epic-id>` — **Explore <project> — <date>**. Before I start researching, two quick questions:
  >
  > 1. Do you have a scratch or dev environment I should prefer for any actions that mutate state? (If not, I'll use the current environment and ask before each write/delete/send.)
  > 2. Is there a particular area or feature you want me to focus on, or should I explore freely?

Wait for the user's answer(s). Record: (a) whether a scratch env is available and how to reach it — from the docs or the user, (b) any focus constraint. Then proceed to Phase 1.

---

## Phase 1 — Research (inline)

Research is done inline here — there is no separate sub-agent.

### 1.1 Open a research task under the epic

```bash
bd create --type task --title "Research: read docs and history" \
  --parent <epic-id> \
  --description "Read project structure, docs, and history to produce the exploration understanding file."
```

Capture the research task ID.

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

- Open beads tasks: `bd list --status open`
- Recently closed: `bd list --status closed --limit 20`
- GitHub issues (if the project uses GitHub): `gh issue list --state all --limit 30` and `gh issue list --state closed --limit 20`
- `CHANGELOG.md` or `HISTORY.md` if present
- Recent commits: `git log --oneline -20`

### 1.4 Read prior exploration sessions

Each past `explore-project` session leaves an epic titled `Explore <project> — <YYYY-MM-DD>`. Pull recent ones so this session does not re-tread covered ground or re-file known issues.

```bash
bd list --type epic
```

From the results, keep only exploration epics whose **title date is within the last 14 days**. Ignore older epics — their findings may be stale and the project has likely moved on.

For each recent exploration epic, read its wrap-up summary and its still-open children:

```bash
bd comments <recent-epic-id>
bd list --parent <recent-epic-id> --status open
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
bd close <research-task-id> --reason done \
  --comment "Understanding file written to temp path. Research complete."
```

---

## Phase 2 — Exploration loop (one action, then ask)

Read the understanding file. Then enter the loop.

Each iteration is exactly one action. Do not chain or batch actions — pick one, do it, judge it, record it, then stop and ask.

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
   bd list --parent <epic-id> --status open
   ```

   Also check the open findings and questions from recent sessions recorded in the understanding file's "Prior exploration" section.

   If an existing task — in this epic or a recent prior one — already covers the same issue, add a comment to that task instead of creating a duplicate.

   **Filing a finding** (broken or rough behaviour):

   ```bash
   bd create --type bug --label explore:finding \
     --parent <epic-id> \
     --title "<short description>" \
     --description "What I did: ...
   Expected (source: ...): ...
   Actual: ...
   Severity: ...
   Repro: ..."
   ```

   **Filing a question** (genuine ambiguity):

   ```bash
   bd create --type task --label explore:question \
     --parent <epic-id> \
     --title "<short question>" \
     --description "Context: ...
   What I observed: ...
   Why this is unclear: ..."
   ```

**5. Check in** — report what happened:
   - What you did
   - What you found (or "nothing notable")
   - Any task ID filed
   - Then stop and ask: **Continue (next action) / Redirect ("go deeper on X") / Stop?**

   Wait for the user before the next iteration.

---

## Phase 3 — Wrap-up

When the user says "stop" or when the session ends naturally, post a summary comment on the epic.

```bash
bd comments add <epic-id> --body "..."
```

The summary must include:

1. **Actions tried** — a brief list of what was exercised
2. **Tasks filed** — finding IDs and question IDs, each with a one-line description
3. **Coverage and limits** — an explicit note on what was NOT explored and why (time, access, scope focus, etc.)

Do not write "all good" or "no issues found". If nothing was filed, write "No findings or questions filed during this session — coverage was limited to: <list>."

The epic and its child tasks are the deliverable. They remain open for normal beads triage.
