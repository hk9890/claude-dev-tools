---
name: tasks-create
description: "Turn this conversation — a review, a plan, a spec — into a set of filed tasks with real blocking edges, approved before anything is written."
user-invocable: true
disable-model-invocation: true
argument-hint: "[scope]"
---

# Creating tasks from this conversation

The material is already here: a review that produced findings, a plan that was argued out, a spec
that was read. This skill turns it into filed tasks. **Scope:** $ARGUMENTS narrows which material to
file — "only the critical findings", "just the auth work". With no scope, everything actionable in
the conversation is a candidate and step 4 confirms the set.

## 1. Load the standard

Load `tasks:tasks-writing` before drafting anything. It owns the type contracts, the four body
sections, and the rules each body must clear; this skill owns only how a conversation becomes a
*set* of them. Draft nothing before it is loaded — repairing a batch of wishes afterwards costs more
than writing them right once.

## 2. Confirm the tracker

```bash
command -v taskmgr >/dev/null 2>&1   # is the binary installed?
taskmgr where                         # does a store resolve, and which one?
```

Read `where`'s output rather than its exit status — it exits `0` whether or not a store resolves. No
binary, or `kind: none`, means stop and tell the user; offer `taskmgr init` for a missing store.

## 3. Gather and ground

Collect the actionable material from the conversation, and read anything it points at that you have
not read — a linked spec, an issue, a file discussed but never opened.

Then ground it in the repository. Open the code each task will touch and take the real path, the
real symbol, the real command from it. A task written from memory of the discussion carries the
discussion's vocabulary; a task written from the code carries the project's, and the implementer
starts in the right file instead of searching for it.

## 4. Decompose

Two shapes, depending on what the conversation produced.

**Findings** — a review, a `/simplify` pass, a failing build. One task per finding; no slicing.
Several instances of the *same* fix are one task. A finding that is both a defect and untidiness
around it splits by type, not by call site.

**A plan or spec** — cut it into **tracer bullets**. Each task is a narrow but *complete* path
through every layer it touches — schema, API, UI, test — so finishing it produces something
demonstrable. Size each to one sitting. Horizontal slices ("do all the schema changes") are the
failure mode here: every one of them can be finished with nothing working end to end, so the first
evidence anything is right arrives only after the last task closes.

Then the edges:

- **Blocked-by** is a real ordering constraint: B genuinely cannot start until A closes. Preferring
  to do A first is not a blocker — that is what priority is for. False edges make the ready queue
  lie about what is available.
- **Parent** groups children under an epic when the set shares one outcome. It is organisational and
  never blocks anything.

## 5. Get the set approved

Present the whole set as a numbered list before writing anything — id-less at this point:

```
1. [bug/1]     Expired access token is accepted on every endpoint
2. [feature/2] Export the orders table as CSV        blocked by: 1
3. [chore/3]   Collapse the three date formatters
```

Ask the user about granularity (too coarse, too fine), the blocking edges, and anything to merge,
split, or drop. Iterate until they approve. Nothing is filed before that approval — a filed task
set is harder to reshape than a list in a message.

## 6. File them

Create in dependency order — an epic and any blocker before the issues that reference them, since
their ids do not exist until they are created. Ids are opaque short codes; take each from the
command's output and never invent one.

```bash
cat <<'EOF' | taskmgr create --title "Expired access token is accepted on every endpoint" \
    --type bug --priority 1 --description-file -
## Context
src/middleware/auth.ts:42 — reproduced on main at a1b3f90.

## Problem
verifyToken reads the exp claim but never compares it to the current time, so any structurally
valid token authenticates indefinitely. <observed output>

## Recommended action
Compare exp against the current time and reject when it is past; return 401.

## Acceptance criteria
- [ ] A request with an expired token returns 401
- [ ] A request with a valid token still returns 200
- [ ] `npm test -- auth` passes, including a case for the expired path
EOF
```

Add `--parent <epic-id>` to group, `--blocked-by <id>` for an edge known at creation time, and
`--label area:<x>` for routing. An edge discovered later is `taskmgr dep add <dependent> <blocker>`.

## 7. Report

List what was created — id, type, priority, title — and the edges between them, so the user can see
the shape and run `taskmgr ready`. Name anything you did not file and why: out of the given scope,
or no testable criterion could be written for it. This skill only creates; existing issues are not
closed or edited here.
