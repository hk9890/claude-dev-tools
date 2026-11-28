---
name: tasks-park
description: "Park this session as a task, to resume it later in a revier tab."
user-invocable: true
disable-model-invocation: true
argument-hint: "[where-it-stopped]"
---

# Park this session

Call the Skill tool with `tasks:tasks-core`, even where it loaded earlier in this session.

A park is a task with the label `kind:park`: an agent that picks it brings this same session back with revier. $ARGUMENTS says where the work stopped or what is next. With no argument, write that from this session.

1. Where `revier:revier` is not in the available skills, stop: a park needs revier to resume. Offer the user `/tasks:tasks-handover`, which hands the work to a new agent. Otherwise call the Skill tool with `revier:revier`, even where it loaded earlier in this session.
2. Run `taskmgr hook list`. Where it lists no `pkg:task-writing:park-body`, tell the user that this store does not check a park body, and write the body of step 5 all the same.
3. The `<id>` is `${CLAUDE_SESSION_ID}`.
4. Find the start directory and the project:
   - `<dir>` is the first `cwd` of the transcript, not `$PWD`, which moves with each `cd`:

     ```bash
     find ~/.claude/projects -maxdepth 2 -name '${CLAUDE_SESSION_ID}.jsonl' -exec jq -r 'select(.cwd) | .cwd' {} + | head -1
     ```

     Where `<dir>` is under `.claude/worktrees/`, tell the user that the park can resume only while that worktree exists.
   - `<project>` is the revier project whose `.project.path` holds `<dir>`. Where several do, take the longest path; where none does, ask the user:

     ```bash
     revier list --json | jq -r --arg d '<dir>' '.[] | select(.project.remote == null) | .project | select(($d + "/") | startswith(.path + "/")) | "\(.name) \(.path)"'
     ```

5. Write the body. A new agent continues from the summary when the transcript is gone, so name only durable paths: a path under `/tmp/`, the session scratchpad included, is gone by then, and the gate refuses it. Add `--dir <dir>` to the command only where `<dir>` is not the project path.

   ```
   ## Context
   Session: <id>
   Project: <project>
   Directory: <dir>
   Worked on: <what this session did>
   Durable paths: <files, branches, PRs and issues the work is in>

   ## Problem
   Stopped at: <where it stopped>
   Next: <what comes next>

   ## Recommended action
   Resume the session in a revier tab:

       revier agent new --no-focus -p <project> --resume <id> [--dir <dir>]

   If the transcript or the directory is gone, continue from this summary in your own
   session, then close this park with a reason that names your session.

   ## Acceptance criteria
   - [ ] revier agent wait <address> --until idle --json prints "session":"<id>"
   ```

   The lines and the command above are a copy of "Filing a park" in `taskmgr guide filing`, from the task-writing package. A change to them in one is a change to both.
6. File it, with a title that names the work, and the body on standard input:

   ```bash
   taskmgr create --type task --label kind:park --title '<title>' --description-file - <<'EOF'
   <body>
   EOF
   ```

   Where the gate refuses the body, fix what it names and file it again.
7. Give the user the new id, and tell them to end this session: a session that still runs cannot be resumed.
