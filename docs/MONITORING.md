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

See [`scripts/analyze-sessions.py`](../scripts/analyze-sessions.py) for all options (`--plugins-dir`, `--output-dir`, `--max-slice-chars`, `--sample-rocky`, `--sample-random`).

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

Plugin renames are handled via `RENAME_ALIASES` in the script. The current map:

```python
RENAME_ALIASES = {
    "complexity-review": "project-quality",
    "html-ask": "html-visualization",
    # project-review, project-ops, and project-docs were merged into project-quality
    "project-review": "project-quality",
    "project-ops": "project-quality",
    "project-docs": "project-quality",
}
```

Both the old name and the new name resolve to the canonical current plugin directory name. This keeps historical transcript data from falling into the unmatched bucket after a plugin is renamed.

Skill-level renames (where a skill was renamed within a plugin, or a skill's plugin prefix changed) are handled via `SKILL_RENAME_ALIASES`. This map is applied before the per-skill summary aggregation so renamed skills merge into a single row rather than fragmenting. The current map:

```python
SKILL_RENAME_ALIASES = {
    # html-ask plugin era (plugin was later renamed to html-visualization)
    "html-ask:html-ask": "html-visualization:html-visualize",
    # intermediate names inside html-visualization before the unified skill
    "html-visualization:html-ask": "html-visualization:html-visualize",
    "html-visualization:html-feedback": "html-visualization:html-visualize",
    "html-visualization:visualize-html": "html-visualization:html-visualize",
    # project-docs skills -> consolidated into project-quality:project-review-docs (read-only audit)
    "project-docs:coder-docs": "project-quality:project-review-docs",
    "project-docs:create-docs": "project-quality:project-review-docs",
    "project-docs:improve-doc": "project-quality:project-review-docs",
    "project-docs:project-improve-doc": "project-quality:project-review-docs",
    "project-docs:init-or-update-docs": "project-quality:project-review-docs",
    "project-docs:review-docs": "project-quality:project-review-docs",
    "project-docs:revise-docs": "project-quality:project-review-docs",
    "project-docs:project-docs": "project-quality:project-review-docs",
    "project-docs:project-create-docs": "project-quality:project-review-docs",
    "project-docs:project-improve-docs": "project-quality:project-review-docs",
    "project-docs:project-init-or-update-docs": "project-quality:project-review-docs",
    "project-docs:project-review-docs": "project-quality:project-review-docs",
    "project-docs:project-revise-docs": "project-quality:project-review-docs",
    # project-ops skills -> project-quality exec-* family (testing / releasing / monitoring)
    "project-ops:analyze-monitoring-data": "project-quality:project-exec-monitoring",
    "project-ops:executes-tests": "project-quality:project-exec-testing",
    "project-ops:project-executes-tests": "project-quality:project-exec-testing",
    "project-ops:trigger-release": "project-quality:project-exec-releasing",
    "project-ops:project-analyze-monitoring-data": "project-quality:project-exec-monitoring",
    "project-ops:project-run-tests": "project-quality:project-exec-testing",
    "project-ops:project-trigger-release": "project-quality:project-exec-releasing",
    # project-quality ops renamed to the project-exec-* family
    "project-quality:project-run-tests": "project-quality:project-exec-testing",
    "project-quality:project-trigger-release": "project-quality:project-exec-releasing",
    "project-quality:project-analyze-monitoring": "project-quality:project-exec-monitoring",
    # complexity-review plugin era (plugin later renamed; reviews now live in project-quality)
    "complexity-review:complexity-review": "project-quality:project-review-complexity",
    # project-review skills -> project-quality (the test -> tests rename happened in the merge)
    "project-review:complexity-review": "project-quality:project-review-complexity",
    "project-review:consistency-review": "project-quality:project-review-consistency",
    "project-review:structure-review": "project-quality:project-review-structure",
    "project-review:test-review": "project-quality:project-review-tests",
    "project-review:project-review-complexity": "project-quality:project-review-complexity",
    "project-review:project-review-consistency": "project-quality:project-review-consistency",
    "project-review:project-review-structure": "project-quality:project-review-structure",
    "project-review:project-review-test": "project-quality:project-review-tests",
    # project-explore skill renamed (explore-project -> project-explore)
    "project-explore:explore-project": "project-explore:project-explore",
}
```

### Friction-score formula

The friction score is a **per-turn normalized weighted sum** of friction signals. From the script:

```python
FRICTION_WEIGHTS = {
    "tool_errors": 3.0,
    "interruptions": 2.0,
    "permission_denials": 2.0,
    "user_corrections": 0.5,
    "retries": 1.0,
    "ask_user_questions": 0.5,
}
```

```python
raw = (
    self.tool_errors * FRICTION_WEIGHTS["tool_errors"]
    + self.interruptions * FRICTION_WEIGHTS["interruptions"]
    + self.permission_denials * FRICTION_WEIGHTS["permission_denials"]
    + self.user_corrections * FRICTION_WEIGHTS["user_corrections"]
    + self.retries * FRICTION_WEIGHTS["retries"]
    + self.ask_user_questions * FRICTION_WEIGHTS["ask_user_questions"]
)
friction_score = round(raw / self.turn_count, 4)  # 0.0 if turn_count == 0
```

**Field semantics:**

| Field | Source in transcript | How it is counted |
|-------|----------------------|-------------------|
| `tool_errors` | `tool_result.is_error == true` inside a user message | +1 per erroring result |
| `interruptions` | `record.toolUseResult.interrupted == true` on the user record | +1 per interrupted turn |
| `permission_denials` | `tool_result.content` contains `"doesn't want to proceed"` or `"tool use was rejected"`, **guarded by `is_error == true`** | +1 per denial. The `is_error` guard prevents false positives when file content read by the model happens to contain the phrase (e.g. this file describes the detector strings) — a normal Read result has `is_error == false`. |
| `user_corrections` | First sentence of user prose matches `\b(no|wrong|stop|don'?t|actually|revert)\b` | +1 per matching turn. Harness-generated blocks inside the user message (`<command-name>`, `<command-args>`, `<local-command-stdout>`, `<bash-stdout>`, `<system-reminder>`, `<attachment>`, etc.) are stripped before the regex runs — slash-command bodies are not user prose. |
| `retries` | Same `(tool_name, input_repr[:200])` pair seen a second time | +1 on the first repeat only |
| `ask_user_questions` | `AskUserQuestion` tool call in the assistant turn | +1 per call |
| `duration_ms` | `system` record with `subtype: "turn_duration"`, field `durationMs` | summed across all system events in the episode |

A `friction_score` of 0.0 means a smooth episode; higher values indicate rockier interactions. Episodes are comparable across different lengths because raw penalties are divided by `turn_count`.

### Invocation modes (read this before interpreting the Model-invoked column)

Each skill belongs to one of three modes, derived from its `SKILL.md` frontmatter (`user-invocable` and `disable-model-invocation`). The `summary.md` table surfaces this in the **Mode** column right next to **Model-invoked**, because the two only make sense together:

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
- N evenly-spaced from the remaining episodes as a random baseline (default 5, `--sample-random`)

Slice files are sanitized: credentials and long hex strings are redacted, tool output is capped at `--max-slice-chars` (default 2000).

### Fixture tests

A synthetic fixture and expected output live under `scripts/fixtures/`. Run the fixture check with:

```bash
python3 scripts/analyze-sessions.py \
    --fixture scripts/fixtures/session-fixture.jsonl

python3 scripts/fixtures/check-fixture.py \
    --actual output/session-analysis/fixture/dataset.json \
    --expected scripts/fixtures/session-fixture-expected.json \
    --summary output/session-analysis/fixture/summary.md
```

This is a manual step; it is not part of `bash tests/run-all.sh`.

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

The Tier A friction signal `user_corrections` is a **heuristic**: it detects correction-like words (`no`, `wrong`, `stop`, `actually`, `revert`) in the first sentence of user messages. This signal is fuzzy — it will produce false positives (ordinary conversational use of those words) and false negatives (corrections phrased differently).

**Phase 2 is the authority.** When in doubt about whether a correction actually occurred or whether friction was meaningful, let the Phase 2 judge decide based on full episode context.

## False-negative pass

The unmatched-plugin table in `output/session-analysis/summary.md` shows plugins attributed in transcripts that did not resolve to any known marketplace plugin. This catches stale plugin names but does not catch sessions where attribution was absent entirely.

To check for missed attribution (sessions where a plugin was active but `attributionPlugin`/`attributionSkill` were never set):

1. Read `output/session-analysis/summary.md` and identify skills with zero or unexpectedly low episode counts.
2. Sample a few session JSONL files from `~/.claude/projects/` for projects where those plugins should have been active.
3. Search for assistant turns with no `attributionSkill` field and compare the turn content against plugin skill descriptions to see if attribution was silently missing.

This pass is manual and judgment-based; there is no automated tool for it.
