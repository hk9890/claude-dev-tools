# Monitoring Plugin Usage

The session-analysis workflow: index Claude Code transcripts into episode records, score friction, then judge sampled episodes with Claude Code itself.

## Data source

Claude Code writes transcripts to `~/.claude/projects/<slug>/<uuid>.jsonl`, one JSON record per line:

| `type` | Carries |
|---|---|
| `assistant` | Claude's turn, plus `attributionPlugin` (plugin directory name, e.g. `tasks`) and `attributionSkill` (namespaced, e.g. `tasks:tasks-writing`) while a skill runs — absent on unattributed turns, and never set on any other record type |
| `user` | The human turn, and the `tool_result` blocks inside its `content` array; a failed tool is `tool_result.is_error == true`, an interrupted turn is `record.toolUseResult.interrupted == true` |
| `system` | Internal events, e.g. `subtype: "turn_duration"` with `durationMs` |

## Phase 1 — offline indexer

Run `mise run analyze-sessions`, or `python3 scripts/analyze-sessions.py` from the repo root — the mise task pins cwd, which decides where `output/` lands. Options append to either form:

```bash
python3 scripts/analyze-sessions.py                                    # full scan of ~/.claude/projects
python3 scripts/analyze-sessions.py --projects-dir /path/to/projects   # scan elsewhere
python3 scripts/analyze-sessions.py --project dt-operator --since-days 2
python3 scripts/analyze-sessions.py --fixture scripts/fixtures/session-fixture.jsonl
```

`--project` matches a substring of the project directory name. `--since-days` filters on file mtime — "sessions touched in the window", so a long-lived session modified recently is included whole, old episodes and all. `--help` lists the rest.

### Output

Under `output/session-analysis/` (relative to cwd, or `--output-dir`); `--fixture` redirects it to `.../fixture/`.

| Path | Contents |
|---|---|
| `dataset.json` | One record per episode; no raw message content |
| `summary.md` | Per-skill aggregates and the unmatched-plugin table |
| `episodes/` | Sanitized per-episode slice files (sampled subset) |

Each `dataset.json` record carries:

- **Identity** — `episode_id`, `session_id`, `source_file`, `start_line`, `end_line`
- **Attribution** — `attribution_skill` (raw attributed name), `attribution_plugin` (canonical), `trigger_type`
- **Friction** — `turn_count`, `tool_errors`, `interruptions`, `permission_denials`, `user_corrections`, `ask_user_questions`, `retries`, `duration_ms`, `friction_score`
- **Outcome** — `ended_in_commit`, `ended_in_pr`, `tests_run`, `tests_passed`

### Episode delimiting

An **episode** is a contiguous run of assistant messages sharing one `attributionSkill`. A new one opens when that value changes and the incoming skill resolves to a known marketplace plugin; an unattributed assistant message closes the open one. User messages, `tool_result` blocks, and `system` events between attributed turns join the currently-open episode by position — they never delimit. Records are deduped by `uuid`, so a resumed or copied history counts once; records without a `uuid` are never deduped.

### Rename aliases

`RENAME_ALIASES` (plugin renamed) and `SKILL_RENAME_ALIASES` (skill renamed, or its plugin prefix changed) in [`scripts/analyze-sessions.py`](../scripts/analyze-sessions.py) are the single source of truth, pinned by a fixture test. Skill aliases apply before aggregation, so renamed skills merge into one `summary.md` row while `dataset.json` keeps the raw name. Add an entry in the same change as the rename, or that name's history falls into the unmatched bucket.

### Reading the numbers

`friction_score` is a weighted signal sum divided by `turn_count`, so episodes of different lengths compare directly: 0.0 is smooth, higher is rockier. Tool errors weigh heaviest, interruptions and denials sit in the middle, corrections and questions weigh least — the authoritative weights are `FRICTION_WEIGHTS` and `Episode._compute_friction()` in the script, deliberately not mirrored here, as are the `*_RE` signal patterns. What reading those will not tell you:

- `tool_errors` skips results matching `"Cancelled: parallel tool call"` — the un-run siblings of an interrupted batch are user cancellations, not failures.
- `permission_denials` matches its detector phrases only where `is_error == true`. Without that guard, model-read file content containing a phrase would score a denial.
- `user_corrections` strips harness-generated blocks (`<command-name>`, `<system-reminder>`, …) before matching, since a slash-command body is not user prose. Fuzzy in both directions — **Phase 2 is the authority** on whether a correction happened.
- `retries` counts only the first repeat of a `(tool_name, input_repr[:200])` pair.
- The outcome signals are pattern matches over the serialized assistant turn (`ended_in_commit`, `ended_in_pr`) or over `tool_result` text (`tests_run`, `tests_passed` — the latter gated on `tests_run`, so stray "pass" text cannot report a pass with no run). Coarse signals, not verified outcomes. Only commits and PRs reach `summary.md`; read the test signals from `dataset.json`.

### Invocation modes

Read this before commenting on `summary.md`'s **Model-invoked** column. Every column after **Mode** is an absolute count or an average over the skill's episodes — none is a percentage. **Model-invoked** counts episodes whose `trigger_type` is `explicit`; divide by **Episodes** for the rate.

Mode comes from the skill's frontmatter and only means something beside Model-invoked:

| Mode | Frontmatter | Expected Model-invoked |
|---|---|---|
| `user-only` | `user-invocable: true` + `disable-model-invocation: true` | **Always 0** — the `Skill` tool cannot reach it. By design, not a measurement gap. |
| `library` | `user-invocable: false` | Should equal **Episodes**; a shortfall means some loads bypass the `Skill` tool (Read, file include) and is worth investigating. |
| `both` | neither flag set | Anything from 0 to **Episodes** — the ratio is how often the model reached for the skill rather than the user picking it. |

`trigger_type` is `explicit` when the assistant invoked the `Skill` tool for this skill in the preceding turn or the episode's own first turn, `ambient` otherwise — already running, loaded through another path, or slash-invoked, which the classifier cannot tell apart. Every `user-only` episode is `ambient` by definition, so never report that the classifier "missed user invocations" without reading Mode first.

### Slice sampling

`episodes/` holds the top N by friction score (`--sample-rocky`, default 5) plus N evenly spaced over the friction-sorted remainder (`--sample-baseline`, default 5) — a stride, not a random draw, so the emitted set is a pure function of the friction ordering. Each slice carries the episode's summary fields plus an `events` array reconstructing the conversation, so the Phase 2 judge reads real content rather than stats. Credential-like strings and long hex are redacted, and each event's text is capped at `--max-slice-chars` (default 2000).

The fixture regression suite for this script lives under `scripts/fixtures/` — see [TESTING.md](TESTING.md).

## Phase 2 — Claude-in-the-loop judging

Claude Code itself judges the slices (your subscription, no API key). Read each slice in `output/session-analysis/episodes/`, score it against the rubric, and write one verdict file per slice to `output/session-analysis/verdicts/`, named to match the slice. To hand the pass to a fresh session:

```
Judge the episode slices in output/session-analysis/episodes/ using the
session-analysis rubric. Write verdicts to output/session-analysis/verdicts/.
```

Score each dimension 1–5 with a rationale:

| Dimension | What it measures |
|---|---|
| `trigger-appropriate` | Was the skill the right tool for the request? |
| `followed-instructions` | Did Claude follow the skill's instructions faithfully? |
| `task-completed` | Was the user's underlying task completed? |
| `user-accepted` | Did the user accept the outcome without correction or retry? |

```json
{
  "episode_id": "<copied from the slice>",
  "attribution_skill": "<copied from the slice>",
  "scores": {
    "trigger-appropriate": { "score": 4, "rationale": "…" },
    "followed-instructions": { "score": 5, "rationale": "…" },
    "task-completed": { "score": 3, "rationale": "…" },
    "user-accepted": { "score": 3, "rationale": "…" }
  },
  "notes": "optional — anything that does not fit a dimension"
}
```

All four dimension keys must be present — score `null` with a rationale saying why the slice cannot support one, since an omitted key is indistinguishable from an oversight. Nothing consumes these files yet; the format exists so two judging runs are comparable.

## False-negative pass

`summary.md`'s unmatched-plugin table lists plugins attributed in transcripts that resolved to no known marketplace plugin. Plugins from *other* marketplaces (e.g. `commit-commands` from `claude-plugins-official`) belong there; only a stale name of one of this repo's own plugins is actionable.

The table cannot catch sessions where attribution was absent entirely. For those: read `summary.md` for skills with zero or unexpectedly low episode counts, sample session JSONL files from `~/.claude/projects/` for projects where those plugins should have been active, then compare assistant turns carrying no `attributionSkill` against the skill descriptions. Manual and judgment-based — no tool automates it.
