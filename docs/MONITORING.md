# Monitoring Plugin Usage

The session review: pick the Claude Code sessions of this machine or of an ssh host that used a plugin of this marketplace, review each for plugin problems, and keep every run in a private store.

## Data source

Claude Code writes a session to `~/.claude/projects/<slug>/<uuid>.jsonl`, and its subagents to `<uuid>/subagents/**/agent-*.jsonl` beside it, one JSON record per line. It deletes a transcript about 30 days after its last write.

| `type` | Carries |
|---|---|
| `assistant` | Claude's turn, plus `attributionPlugin` (plugin directory name, e.g. `tasks`) and `attributionSkill` (namespaced, e.g. `tasks:tasks-core`) from the first turn after a skill loads to the turn that loads the next one, or to the end of that user turn; a forked skill changes neither. Work after the skill in the same turn counts for it too, as nothing marks where the skill's work ends |
| `user` | The human turn, and the `tool_result` blocks inside its `content` array. A failed tool is `tool_result.is_error == true`; `toolDenialKind` says who refused a call that never ran (`user-rejected`, `permission-rule`) |
| `attachment` | With `attachment.type` `queued_command` and `attachment.origin.kind` `human`: a prompt the user typed while the agent worked. No `user` record holds it; `render` prints it as `USER (queued)`. The context cost reads six more types: `instructions` (the AGENTS.md and CLAUDE.md files loaded, with path and content), `skill_listing` (the listing text, one `- <name>: <text>` entry per skill), `agent_listing_delta` (`addedLines` of the agent listing), `invoked_skills` (each skill body loaded again after a compaction), `file` (a file's text Claude Code attached itself, mostly the files it restores after a compaction), `edited_text_file` (a snippet of a read file that changed on disk) |
| `system` | With `subtype` `compact_boundary`: a compaction. The context before it is replaced by a summary |

## The review store

A run is written to the directory in `SESSION_REVIEW_DIR`: a checkout of the private repository `hk9890/session-data`. A transcript holds everything its session read, so no part of a run belongs in this public repository.

Set the variable in `mise.local.toml` at the repo root, which git ignores:

```toml
[env]
SESSION_REVIEW_DIR = "/home/<you>/dev/github/session-data"
```

`git pull` in the store before a run: a session that another machine reviewed is skipped only once its run is here.

## Run a review

`git fetch --tags` first: the pick finds the last release in the local tags only. Then run the `review-sessions` workflow ([`.claude/workflows/review-sessions.js`](../.claude/workflows/review-sessions.js)) from the repo root, with `{perBucket, sinceDays, host}`:

1. **Pick** — `mise run pick-sessions -- pick` starts the run folder, copies the transcripts, writes `usage.md` and `context.md`, and prints the picks.
2. **Review** — one agent per session reports each plugin problem and judges each loaded file.
3. **Verify** — a second agent tries to refute each finding and each judgment.
4. **Record** — `python3 scripts/pick-sessions.py record` writes into the run each reviewed session with every verdict, and the findings and judgments that survived; the agent commits and pushes it.

Quote a transcript line from the run's copy under `transcripts/`: it stays after Claude Code deletes the original.

What a pick, a version label and the report sections mean is printed with the output itself: the `legend` of the pick, and the headers of `usage.md` and `context.md`.

File each finding of `findings.json` in the tracker by hand, with its version. When its fix ships, a finding that a later run reports again for a newer version is a regression.

`mise run pick-sessions -- context` prints the context cost of each file over the runs of the store.

### Another machine

Pass the ssh host name as `host`: `{host: "dt-7zykdj4"}`. The pick mirrors the host's transcripts and names the run for it; the reviews run on this machine. The host needs `rsync` and key-based ssh: the pick runs ssh with `BatchMode=yes`, so a password prompt stops it.
