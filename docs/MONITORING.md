# Monitoring Plugin Usage

How to run the session-analysis workflow: index session transcripts into episode records, score friction, and use Claude Code's built-in judge to review sampled episodes.

## Data source

Claude Code writes session transcripts to `~/.claude/projects/<slug>/<uuid>.jsonl`. Each line is a JSON record. The relevant record types are:

| `type` | When it appears |
|--------|-----------------|
| `assistant` | Claude's response turn; carries `attributionPlugin` and `attributionSkill` when a skill is active |
| `user` | The human turn; contains `tool_result` blocks (tool output / errors) inside its `content` array |
| `system` | Internal events, e.g. `subtype: "turn_duration"` with `durationMs` |

### Attribution fields

`attributionPlugin` and `attributionSkill` appear **on assistant messages only**. They are set by the harness when a skill is running and are absent on unattributed turns.

- `attributionPlugin` — the plugin directory name (e.g. `tasks`)
- `attributionSkill` — the namespaced skill identifier (e.g. `tasks:tasks`)

`tool_result` blocks live **inside user messages**, not assistant messages. The error signal is `tool_result.is_error == true`.

## Phase 1 — offline indexer

### Running the script

From the repo root:

```bash
# Full scan (reads ~/.claude/projects by default)
python3 scripts/analyze-sessions.py

# Override the projects directory
python3 scripts/analyze-sessions.py --projects-dir /path/to/projects

# Run against a single fixture file (for testing)
python3 scripts/analyze-sessions.py --fixture scripts/fixtures/session-fixture.jsonl
```

Run the script with `--help` for all options (`--plugins-dir`, `--output-dir`, `--max-slice-chars`, `--sample-rocky`, `--sample-baseline`).

### Output paths

All output lands under `output/session-analysis/` (relative to cwd, or `--output-dir`):

| Path | Contents |
|------|----------|
| `output/session-analysis/dataset.json` | Per-episode summary records; no raw message content |
| `output/session-analysis/summary.md` | Per-skill aggregates and unmatched-plugin table |
| `output/session-analysis/episodes/` | Sanitized per-episode slice files (sampled subset) |

When `--fixture` is used, output goes to `output/session-analysis/fixture/` instead.

### Episode delimiting

An **episode** is a contiguous run of assistant messages that share the same `attributionSkill`. The rules:

1. A new episode opens when an assistant message carries an `attributionSkill` value that differs from the previous assistant message.
2. User messages, `tool_result` blocks, and `system` events that fall between attributed assistant turns are assigned to the **currently-open episode by position** — they do not delimit or close an episode.
3. When `attributionSkill` changes (or an unattributed assistant message appears), the open episode closes and a new one opens if the incoming skill resolves to a known marketplace plugin.

### Rename-alias maps

Plugin renames are handled via `RENAME_ALIASES` and skill-level renames via `SKILL_RENAME_ALIASES`, both defined in [`scripts/analyze-sessions.py`](../scripts/analyze-sessions.py). The script is the single source of truth — the maps are deliberately not reproduced here. Illustrative entries only:

```python
RENAME_ALIASES = {"complexity-review": "project-quality", ...}          # old plugin dir -> current
SKILL_RENAME_ALIASES = {"github-releases:release": "github-releases:github-releases", ...}
```

`RENAME_ALIASES` maps old plugin directory names to the canonical current name, so historical transcript data does not fall into the unmatched bucket after a plugin is renamed. `SKILL_RENAME_ALIASES` handles renames where a skill was renamed within a plugin or its plugin prefix changed; it is applied before the per-skill summary aggregation so renamed skills merge into a single row rather than fragmenting (`dataset.json` keeps the raw attributed name). When a plugin or skill is renamed, add an entry to the corresponding map in the script — the merge is pinned by the fixture test.

### Friction-score formula

The friction score is a **per-turn normalized weighted sum** of friction signals: each signal count is multiplied by its weight, the weighted counts are summed, and the sum is divided by the episode's `turn_count` (an episode with zero turns scores 0.0). Tool errors carry the heaviest weight, interruptions and permission denials sit in the middle, and corrections/questions weigh least. The authoritative weights and computation are `FRICTION_WEIGHTS` and `Episode._compute_friction()` in [`scripts/analyze-sessions.py`](../scripts/analyze-sessions.py) — deliberately not mirrored here.

**Field semantics:**

| Field | Source in transcript | How it is counted |
|-------|----------------------|-------------------|
| `tool_errors` | `tool_result.is_error == true` inside a user message | +1 per erroring result, **except** results whose text matches `"Cancelled: parallel tool call"` — those are the un-run siblings of an interrupted parallel batch (user-initiated cancellations, not tool failures) and are not counted. |
| `interruptions` | `record.toolUseResult.interrupted == true` on the user record | +1 per interrupted turn |
| `permission_denials` | `tool_result.content` contains `"doesn't want to proceed"` or `"tool use was rejected"`, **guarded by `is_error == true`** | +1 per denial. The `is_error` guard prevents false positives when file content read by the model happens to contain the phrase (e.g. this file describes the detector strings) — a normal Read result has `is_error == false`. |
| `user_corrections` | First sentence of user prose matches `\b(no|wrong|stop|don'?t|actually|revert)\b` | +1 per matching turn. Harness-generated blocks inside the user message (`<command-name>`, `<command-args>`, `<local-command-stdout>`, `<bash-stdout>`, `<system-reminder>`, `<attachment>`, etc.) are stripped before the regex runs — slash-command bodies are not user prose. |
| `retries` | Same `(tool_name, input_repr[:200])` pair seen a second time | +1 on the first repeat only |
| `ask_user_questions` | `AskUserQuestion` tool call in the assistant turn | +1 per call |
| `duration_ms` | `system` record with `subtype: "turn_duration"`, field `durationMs` | summed across all system events in the episode |

A `friction_score` of 0.0 means a smooth episode; higher values indicate rockier interactions. Episodes are comparable across different lengths because raw penalties are divided by `turn_count`.

### Outcome signals

Alongside friction, each episode carries four boolean outcome signals:

| Field | Source in transcript | Meaning |
|-------|----------------------|---------|
| `ended_in_commit` | The serialized assistant message (whole JSON, incl. tool names/inputs) matches `COMMIT_RE` (`commit` / `git commit`) | The episode's assistant turns mention or invoke making a commit |
| `ended_in_pr` | The serialized assistant message (whole JSON, incl. tool names/inputs) matches `PR_RE` (`pull request`, `gh pr create`, `pr url`) | The episode mentions or invokes opening a pull request |
| `tests_run` | A `tool_result` string matches `TEST_RUN_RE` (`pytest`, `npm test`, `go test`, `cargo test`, `make test`, `mise run test`, `./test`) | Tests were run during the episode |
| `tests_passed` | A `tool_result` string matches `TEST_PASS_RE` (e.g. `all tests passed`, `PASSED`) | A test run reported success |

These are heuristic pattern matches (see the `*_RE` constants in the script), not verified outcomes — treat them as coarse signals. They appear per-episode in `dataset.json` and as per-skill aggregate counts (the **Commits** and **PRs** columns) in `summary.md`.

### dataset.json record fields

Each `dataset.json` entry is one episode:

- **Identity** — `episode_id`, `session_id`, `source_file`, `start_line`, `end_line`
- **Attribution** — `attribution_skill` (raw attributed name; rename aliases are applied only in `summary.md`), `attribution_plugin` (canonical plugin name), `trigger_type` (`explicit` / `ambient`)
- **Friction signals** — `turn_count`, `tool_errors`, `interruptions`, `permission_denials`, `user_corrections`, `ask_user_questions`, `retries`, `duration_ms`, `friction_score`
- **Outcome signals** — `ended_in_commit`, `ended_in_pr`, `tests_run`, `tests_passed`

### Invocation modes (read this before interpreting the Model-invoked column)

Each skill belongs to one of three modes, derived from its `SKILL.md` frontmatter (`user-invocable` and `disable-model-invocation`). The `summary.md` table carries a **Mode** column alongside **Model-invoked**, because the two only make sense together:

| Mode | Frontmatter | What it means | Expected Model-invoked rate |
|------|-------------|----------------|-----------------------------|
| `user-only` | `user-invocable: true` + `disable-model-invocation: true` | Reachable only via slash command. The `Skill` tool cannot invoke it. | **Always 0** — by design, not a measurement gap. |
| `library` | `user-invocable: false` | Loaded by other skills via the `Skill` tool; not user-invocable. | Should be near 100%; lower values mean some loads happen through a non-`Skill` path (Read, file include) and are worth investigating. |
| `both` | Neither flag set | User can slash-invoke **and** the model can invoke via the `Skill` tool. | Tells you how often the model proactively reached for the skill versus the user picking it. |

A 0 in **Model-invoked** is informative for `library` and `both` skills, structurally meaningless for `user-only` skills. Do not write commentary about "the classifier missed user invocations" without first reading the Mode column — for `user-only` skills, the user *is* the only invoker and the column is correct.

### Trigger classification

Each episode is also classified as `explicit` or `ambient`. This is a narrower signal than Mode and lives on the per-episode record in `dataset.json`:

- **explicit** — the assistant invoked the `Skill` tool targeting this skill in the immediately-preceding assistant turn, or in the first turn of the episode itself.
- **ambient** — attribution changed without an explicit `Skill` invocation (the skill was already running, loaded through another path, or the user invoked it via slash command — the classifier cannot distinguish slash from already-running).

For `user-only` skills, every episode is `ambient` by definition.

### Slice sampling

The script selects episodes for the `episodes/` slice output:

- Top N by friction score (default 5, `--sample-rocky`)
- N evenly spaced from the remaining episodes as a baseline (default 5, `--sample-baseline`). The baseline is deterministic by design — an evenly-spaced stride over the friction-sorted remainder, so the emitted slice set is a pure function of the friction ordering (no randomness).

Each slice file carries the episode's summary fields plus an `events` array reconstructing the episode's conversation — assistant turns (text + tool names), user prompts, and tool results — so the Phase 2 judge has real content to read, not just stats. Slice content is sanitized: credential-like strings and long hex are redacted, and each event's text is capped at `--max-slice-chars` (default 2000).

### Fixture tests

The analyze-sessions regression suite (a synthetic fixture and expected output under `scripts/fixtures/`) is a test suite, run under `bash tests/run-all.sh` — see [TESTING.md](TESTING.md) for how to run it by hand.

## Phase 2 — Claude-in-the-loop judging

Phase 2 uses Claude Code itself (your subscription — no API key required) to judge sampled episode slices.

### Workflow

1. Run the Phase 1 script to produce `output/session-analysis/episodes/` slice files.
2. Open a Claude Code session in this repo.
3. Ask Claude to judge the episode slices using the rubric below.

Example prompt:

```
Judge the episode slices in output/session-analysis/episodes/ using the
session-analysis rubric. Write verdicts to output/session-analysis/verdicts/.
```

### Rubric

For each slice, Claude assigns scores on a 1–5 scale with a rationale:

| Dimension | What it measures |
|-----------|-----------------|
| `trigger-appropriate` | Was the skill the right tool for the user's request? |
| `followed-instructions` | Did Claude follow the skill's instructions faithfully? |
| `task-completed` | Was the user's underlying task completed? |
| `user-accepted` | Did the user accept the outcome without correction or retry? |

Claude writes one verdict file per episode to `output/session-analysis/verdicts/`, named to match the slice file.

### Heuristic correction signal vs. Phase 2 authority

The friction signal `user_corrections` is a **heuristic**: it detects correction-like words (`no`, `wrong`, `stop`, `actually`, `revert`) in the first sentence of user messages. This signal is fuzzy — it will produce false positives (ordinary conversational use of those words) and false negatives (corrections phrased differently).

**Phase 2 is the authority.** When in doubt about whether a correction actually occurred or whether friction was meaningful, let the Phase 2 judge decide based on full episode context.

## False-negative pass

The unmatched-plugin table in `output/session-analysis/summary.md` shows plugins attributed in transcripts that did not resolve to any known marketplace plugin. This catches stale plugin names but does not catch sessions where attribution was absent entirely.

To check for missed attribution (sessions where a plugin was active but `attributionPlugin`/`attributionSkill` were never set):

1. Read `output/session-analysis/summary.md` and identify skills with zero or unexpectedly low episode counts.
2. Sample a few session JSONL files from `~/.claude/projects/` for projects where those plugins should have been active.
3. Search for assistant turns with no `attributionSkill` field and compare the turn content against plugin skill descriptions to see if attribution was silently missing.

This pass is manual and judgment-based; there is no automated tool for it.
