# Monitoring Plugin Usage

The session review: pick the Claude Code sessions of this machine or of an ssh host that used a plugin of this marketplace, review each for plugin problems, and keep every run in a private store.

## Data source

Claude Code writes a session to `~/.claude/projects/<slug>/<uuid>.jsonl`, and its subagents to `<uuid>/subagents/**/agent-*.jsonl` beside it, one JSON record per line. It deletes a transcript about 30 days after its last write.

| `type` | Carries |
|---|---|
| `assistant` | Claude's turn, plus `attributionPlugin` (plugin directory name, e.g. `tasks`) and `attributionSkill` (namespaced, e.g. `tasks:tasks-core`) from the first turn after a skill loads to the turn that loads the next one, or to the end of that user turn; a forked skill changes neither. Work after the skill in the same turn counts for it too, as nothing marks where the skill's work ends |
| `user` | The human turn, and the `tool_result` blocks inside its `content` array. A failed tool is `tool_result.is_error == true`; `toolDenialKind` says who refused a call that never ran (`user-rejected`, `permission-rule`) |
| `attachment` | With `attachment.type` `queued_command` and `attachment.origin.kind` `human`: a prompt the user typed while the agent worked. No `user` record holds it; `render` prints it as `USER (queued)`. The [context cost](#context-cost) reads six more types: `instructions` (the AGENTS.md and CLAUDE.md files loaded, with path and content), `skill_listing` (the listing text, one `- <name>: <text>` entry per skill), `agent_listing_delta` (`addedLines` of the agent listing), `invoked_skills` (each skill body loaded again after a compaction), `file` (a file's text Claude Code attached itself, mostly the files it restores after a compaction), `edited_text_file` (a snippet of a read file that changed on disk) |
| `system` | With `subtype` `compact_boundary`: a compaction. The context before it is replaced by a summary |

## The review store

A run is written to the directory in `SESSION_REVIEW_DIR`: a checkout of the private repository `hk9890/session-data`. A transcript holds everything its session read, so no part of a run belongs in this public repository.

Set the variable in `mise.local.toml` at the repo root, which git ignores:

```toml
[env]
SESSION_REVIEW_DIR = "/home/<you>/dev/github/session-data"
```

`git pull` in the store before a run: a session that another machine reviewed is skipped only once its run is here.

```text
$SESSION_REVIEW_DIR/runs/<date>T<time>-<host>-v<marketplace version>/
├── run.json                 # arguments, host, picker commit, candidate counts, last release
├── picks.json               # what the pick printed
├── usage.md                 # skill usage over the window
├── context.json, context.md # what each file of this repository cost in context over the window
├── findings.json            # the findings that survived, each with its session and version
├── context-judgments.json   # the reviewers' judgments of the loaded files that survived
├── sessions/<uuid>.json     # one reviewed session: its pick, every finding and every context judgment, each with its verdict
└── transcripts/<uuid>.jsonl # a copy of the session, with <uuid>/subagents/ beside it
```

A session counts as reviewed once `sessions/<uuid>.json` exists in any run. A later run picks it again only where it went on after that review: its last record is newer than the `ended` of every such file. The whole session is then reviewed again. Quote a transcript line from the copy, which stays after Claude Code deletes the original.

## Run a review

Run the `review-sessions` workflow ([`.claude/workflows/review-sessions.js`](../.claude/workflows/review-sessions.js)) from the repo root. It takes `{perBucket, sinceDays, host}`, 1, 7 and this machine by default, and starts one agent for the pick, at most two per picked session, and one for the record:

1. **Pick** — `mise run pick-sessions -- pick` starts the run folder, copies the transcripts, writes `usage.md` and the [context cost](#context-cost), and prints the picks.
2. **Review** — one agent per session reads it with `python3 scripts/pick-sessions.py render <transcript>` and reports each plugin problem with the plugin file at fault, the version, a quote, and a fix. It also judges each file of `context_files`: needed or not, the sections used and unused, and what was missing.
3. **Verify** — a second agent tries to refute each finding and each judgment.
4. **Record** — `python3 scripts/pick-sessions.py record <run_dir> <result.json>` writes `sessions/`, `findings.json` and `context-judgments.json`; the agent then commits the run in the store and pushes it.

File each finding of `findings.json` in the tracker by hand, with its version. When its fix ships, a finding that a later run reports again for a newer version is a regression.

### Another machine

Pass the ssh host name as `host`: `{host: "dt-7zykdj4"}`. The pick mirrors the host's `~/.claude/projects` with `rsync` over ssh to `~/.cache/claude-dev-tools/session-mirrors/<host>/projects` (under `$XDG_CACHE_HOME` where set), picks from the mirror, and names the run for the host. The reviews run on this machine.

- The host needs `rsync` and key-based ssh: the pick runs ssh with `BatchMode=yes`, so a password prompt stops it.
- The mirror stays: the next pick copies only what changed, and drops what the host deleted.

## Reading a pick

A candidate is a session modified in the window, with at least one turn attributed to a plugin under `plugins/`, that no run has reviewed to its end. Each bucket takes its top `--per-bucket` candidates, in this order, and a session lands in one bucket only:

| Bucket | Signal |
|---|---|
| `pushback` | Seconds in which the user interrupted the agent or rejected a tool call. One interrupt counts once, whatever the number of parallel calls and subagents it stopped |
| `errors` | Failed tool results. Leaves out a call that never ran: a denial, a worktree-isolation refusal by Claude Code, and the cancelled siblings of an interrupted batch |
| `output_tokens` | Output tokens, each API message counted once |
| `changed` | The session ran, at the version of the last release, a plugin that the release changed. Sessions that ran a changed skill come first; the draw inside each group is random |
| `random` | A random draw from the candidates no other bucket took; `--seed` repeats it |

- Every signal includes the session's subagent transcripts.
- A session that two project folders hold, after a project moved, is one candidate: the pick reads the copy whose last record is newest, and warns about the other.
- `large_transcripts` lists each unreviewed session that holds a file of 50 MB or more. From 100 MB the session is `refused` and no candidate: GitHub rejects the push of such a file. The workflow logs each entry.
- A refusal by a plugin's own guard (`worktree-flow`, `revier`) is a `permission-rule` denial and counts in no signal.
- `output_tokens` ranks long sessions first, whatever their quality.
- A session attributed to a plugin's former name is no candidate: the pick knows the directory names under `plugins/` only.

### Last release

`release` names the newest `v<x.y.z>` tag of this checkout, the tag before it, the plugins with a file that differs between the two, and the count of candidates for the `changed` bucket. `git fetch --tags` before a run: the pick reads the local tags only.

- A plugin's `plugin.json` and its `tests/` do not count as a change: every release bumps the first, and no session runs the second.
- Each picked session that ran a changed plugin at the release version carries `changed_files`, whatever its bucket, and its reviewer reads that diff first.
- The bucket is empty until a session loads a skill from the new install. A `dev@` session never counts: it ran a checkout, not the release.
- A session that only a changed hook acted in is no candidate: it carries no version ([Plugin version](#plugin-version)).

### Plugin version

`skill_versions` gives, for each skill a session used, the version labels that served it. The source is the banner Claude Code writes when it loads a skill, `Base directory for this skill: <path>`:

| Banner path | Label |
|---|---|
| `…/<plugin>/<x.y.z>/skills/<skill>`, a cached install | `x.y.z` |
| `…/.claude/worktrees/<name>/plugins/<plugin>/skills/<skill>` | `dev@<name>` |
| `…/plugins/<plugin>/skills/<skill>`, any other checkout | `dev@main` |

- A turn takes the label of the last banner before it in its own transcript: for its skill, else for its plugin.
- A subagent turn with no banner in its own transcript takes the label its session loaded last before the turn's timestamp. This is an inference: nothing in a subagent transcript confirms it.
- `unknown` marks a turn with no banner before it. A plugin that acts through a hook alone leaves no version in a transcript.
- A `dev@` label names a checkout, not a commit: no record holds the commit.

### `usage.md`

One row per skill, over every session of the window that used a plugin of this marketplace: the candidates, the sessions already reviewed, and the refused ones. **Model-invoked** counts `Skill` tool calls for the skill, **Slash-invoked** counts `/<plugin>:<skill>` commands the user typed. A skill with `disable-model-invocation: true` has 0 model invocations by design. The list below the table names the skills under `plugins/` that no session of the window used.

### Context cost

`context.md` covers every session of the window, subagents included, with or without plugin use: the skill listing reaches each of them. Sizes are characters. A **char-read** is one character sent in one API call: a text counts once for each call after it, up to the next compaction.

| Section | Counts |
|---|---|
| Files | char-reads and characters loaded per file, by channel: `listing` (skill and agent listing entries), `skill-body`, `skill-reinjected` (the copy after a compaction), `instructions` (the checkout's AGENTS.md and CLAUDE.md), `read` (Read tool results), `attached` (`file` and `edited_text_file` attachments) |
| Readers | the contexts that read a file, by `session` or subagent `agentType`, and how many edited a file of this repository after the read |
| Reference reach | for each skill load, the files of its plugin read with the Read tool after it in the same context: a lower bound, as agents also print references with `cat` |
| Re-reads | Reads of the same part of a file a context had read already |
| Trouble per skill version | failed and user-rejected tool calls of a skill's turns, inherited ones apart |

- A path is a file of this repository where it is an install under `plugins/cache/<marketplace name>/`, or lies below a top-level entry that git tracks, in a checkout or in the marketplace clone under `plugins/marketplaces/<marketplace name>/`. A checkout is the directory of a loaded AGENTS.md whose first line is this repository's, or the checkout that holds it where that directory is a worktree under `.claude/worktrees/`: a change to that line leaves the checkouts of older sessions unrecognized.
- What Bash commands print, agent system prompts, workflow agent prompts and a failed Read count in no channel; a failed edit is no edit.
- Usefulness is the reviewers' judgment in `context-judgments.json`: the counts show cost and what followed a read, not why.
- `mise run pick-sessions -- context` prints the characters each file put into an average API call, one column per run of the store.
