# Claude Code Extension Authoring: Tooling Map

Research date: 2026-07-10. Verified against Claude Code **v2.1.206** (local CLI) and live docs.

Docs have moved: `docs.claude.com/en/docs/claude-code/*` → **`code.claude.com/docs/en/*`** (old URLs 301-redirect).
Product/skills docs live on `platform.claude.com`. The repo `anthropics/claude-plugins-public` is the **old name** of
`anthropics/claude-plugins-official` (301-redirects); it is not a separate repo.

---

## 1. Shortest path per artifact type

| Artifact | Fastest official tool | Command / invoke |
|---|---|---|
| **Plugin (scaffold)** | `claude plugin init` [official CLI] | `claude plugin init my-plugin --with skills hooks` |
| **Plugin (guided build)** | `create-plugin` [official, in plugin-dev] | `/plugin-dev:create-plugin` |
| **Skill** | `skill-creator` [official skill] | ask "create a skill…"; or write `.claude/skills/<name>/SKILL.md` |
| **Agent (subagent)** | `agent-creator` [official, in plugin-dev] | ask "create an agent that…"; or write `.claude/agents/<name>.md` |
| **Command** | *(merged into skills)* | write a skill; legacy `.claude/commands/<name>.md` still works |
| **Hook** | `hookify` [official plugin] (markdown rules, no JSON) | `/hookify "<behavior>"`; or `plugin-dev:hook-development` for `hooks.json` |
| **MCP server** | `mcp-server-dev` [official plugin] | `/plugin install mcp-server-dev@claude-plugins-official` → `build-mcp-server` skill |
| **Agent SDK app** | `agent-sdk-dev` [official plugin] | `/new-sdk-app <name>` (scaffolds + auto-runs a verifier subagent) |
| **Workflow** | Dynamic Workflows [official harness feature] | `/workflows`, the `ultracode` keyword, or `/effort ultracode` |

Two things most people get wrong: **a scaffold CLI exists** (`claude plugin init`, since v2.1.157), and **custom slash
commands are now the same system as skills** — author a skill, not a command.

Install the toolkit from the **canonical, maintained** marketplace, not the frozen copy bundled in `anthropics/claude-code`
(last touched 2025-11-17):

```
/plugin marketplace add anthropics/claude-plugins-official
/plugin install plugin-dev@claude-plugins-official
/plugin install skill-creator@claude-plugins-official
```

---

## 2. Per-artifact-type reference

### Plugin

- **Tooling** [official]: `claude plugin init|new <name>` scaffolds `~/.claude/skills/<name>/` with `plugin.json` + starter
  `SKILL.md`; auto-loads next session as `<name>@skills-dir`. Flags: `--with skills|agents|hooks|mcp|lsp|output-style|channel`,
  `--author`, `--author-email`, `--description`, `-f/--force`.
  Guided alternative: `/plugin-dev:create-plugin` — an 8-phase interactive workflow (discovery → planning → design → structure
  → implementation → validation → testing → docs). Note it hand-rolls `mkdir`+`Write` and does **not** call `claude plugin init`;
  the two are complementary.
- **Docs**: https://code.claude.com/docs/en/plugins · reference (full `plugin.json` schema, only `name` required):
  https://code.claude.com/docs/en/plugins-reference
- **Reference impl**: `example-plugin` (manifest, `.mcp.json`, model-invoked skill, user-invoked skill, legacy command) —
  https://github.com/anthropics/claude-plugins-official/tree/main/plugins/example-plugin
- Components auto-discover from the plugin **root** (`skills/ agents/ hooks/hooks.json .mcp.json .lsp.json monitors/ themes/
  bin/ settings.json`); only `plugin.json` lives in `.claude-plugin/`. A plugin's own `settings.json` supports **only** the
  `agent` and `subagentStatusLine` keys.

### Skill

- **Tooling** [official]: `skill-creator` (interactive create/edit + eval/benchmark — see §3). No `claude skill init`;
  `claude plugin init` doubles as a single-skill-plugin scaffolder. A skill is a directory with `SKILL.md` (YAML frontmatter +
  Markdown). Claude Code follows the **Agent Skills open standard** and extends it with `when_to_use`, `disable-model-invocation`,
  `user-invocable`, `allowed-tools`, `context: fork`, `agent`, `paths`, `effort`, `hooks`.
- **Docs**: Claude Code https://code.claude.com/docs/en/skills · portable spec https://agentskills.io/specification ·
  authoring best practices (third-person descriptions, ≤500-line body, gerund naming, evals-first)
  https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices
- **Reference impl**: `anthropics/skills` — `template/` scaffold, `spec/agent-skills-spec.md`, 17 production skills, and a
  `.claude-plugin/` making the repo installable as marketplace `anthropic-agent-skills` — https://github.com/anthropics/skills
- Guidance skill: `plugin-dev:skill-development`

### Agent (subagent)

- **Tooling** [official]: `agent-creator` (generates an agent from a description) and the `plugin-dev:agent-development` skill.
- **Caveat (verified):** `agent-creator`, `agent-development`, and `scripts/validate-agent.sh` all **lag the current spec**.
  They treat `name`/`description`/`model`/`color` as required and know only 5 fields, with a stale color/model enum. The live
  spec documents ~16 frontmatter fields; only `name` + `description` are required. Optional: `tools`, `disallowedTools`, `model`,
  `permissionMode`, `maxTurns`, `skills`, `mcpServers`, `hooks`, `memory`, `background`, `effort`, `isolation: worktree`, `color`,
  `initialPrompt`. **Validate authored agents against the docs, not the plugin-dev scripts.**
- **`/agents` no longer creates agents** — the interactive creation wizard was removed in v2.1.198. It now just tells you to edit
  `.claude/agents/` or ask Claude. `claude agents` (Agent View) runs/monitors sessions; it does not author.
- **Docs**: https://code.claude.com/docs/en/sub-agents · https://code.claude.com/docs/en/agent-view
- **Reference impl**: `pr-review-toolkit` — six well-scoped single-purpose agents —
  https://github.com/anthropics/claude-plugins-official/tree/main/plugins/pr-review-toolkit
- Write to `.claude/agents/<name>.md` or `~/.claude/agents/`; `--agents '<json>'` for session-only; `claude --agent <name>` runs a
  whole session as that agent.

### Command

- **Merged into skills.** `.claude/commands/deploy.md` and `.claude/skills/deploy/SKILL.md` both produce `/deploy`. The canonical
  `create-plugin` explicitly marks `commands/` as legacy. Legacy `.md` commands still work.
- **Docs**: https://code.claude.com/docs/en/slash-commands · guidance skill `plugin-dev:command-development`
- **Reference impl**: `commit-commands` (`/commit`, `/commit-push-pr`, `/clean_gone`) —
  https://github.com/anthropics/claude-plugins-official/tree/main/plugins/commit-commands

### Hook

- **Tooling** [official]: `hookify` — author guardrail hooks as hot-reloaded markdown rule files
  (`.claude/hookify.<name>.local.md`), no `hooks.json` editing. Commands `/hookify`, `/hookify:list`, `/hookify:configure`.
  For hand-written plugin hooks: `plugin-dev:hook-development` + bundled `hook-linter.sh`, `validate-hook-schema.sh`, `test-hook.sh`.
- **Docs**: reference (~30 events, 5 handler types) https://code.claude.com/docs/en/hooks · guide
  https://code.claude.com/docs/en/hooks-guide
- **Reference impl**: `security-guidance` (regex warnings on Edit/Write → LLM diff review on Stop → SDK-agentic multi-file review
  on commit) — https://github.com/anthropics/claude-plugins-official/tree/main/plugins/security-guidance
- The event surface is far larger than the classic 9. Beyond `PreToolUse`/`PostToolUse`/`Stop`/`SessionStart`: `SubagentStart`,
  `PostToolUseFailure`, `PostToolBatch`, `PermissionRequest`, `PermissionDenied`, `FileChanged`, `CwdChanged`, `ConfigChange`,
  `InstructionsLoaded`, `WorktreeCreate/Remove`, `TaskCreated/TaskCompleted`, `TeammateIdle`, `MessageDisplay`,
  `UserPromptExpansion`, `StopFailure`, `PostCompact`, `Elicitation/ElicitationResult`, `Setup`, `SessionEnd`.
  Handler types: `command`, `http`, `mcp_tool`, `prompt`, experimental `agent`.
  **The plugin-dev hook skill and scripts predate this** and know only the 9 classic events + `command`/`prompt`.

### MCP server

- **Tooling** [official]: `mcp-server-dev` plugin — skills `build-mcp-server` (deployment-model + tool-design interrogation),
  `build-mcp-app` (in-chat UI widgets via `@modelcontextprotocol/ext-apps`), `build-mcpb` (bundle a local server with its runtime).
  Standalone alternative: the `mcp-builder` skill in `anthropics/skills` (FastMCP/TS scaffolding + eval harness).
  Wiring a server *into* a plugin: `plugin-dev:mcp-integration`.
  Separately, `mcp-apps@claude-plugins-official` exists and ships four skills (`create-mcp-app`, `migrate-oai-app`,
  `add-app-to-server`, `convert-web-app`), vendored via `git-subdir` from `modelcontextprotocol/ext-apps`.
- **Docs**: Claude Code MCP client https://code.claude.com/docs/en/mcp · protocol spec (revision 2025-11-25)
  https://modelcontextprotocol.io/specification/2025-11-25/ · scaling rationale
  https://www.anthropic.com/engineering/code-execution-with-mcp
- **Reference impl**: `mcp-builder` — https://github.com/anthropics/skills/tree/main/skills/mcp-builder
- Scaling many tools: **Tool Search Tool** (GA, `defer_loading`, up to 10k deferred tools, ~85%+ context cut) and **Programmatic
  Tool Calling** (`code_execution` + `allowed_callers`) on the API.

### Agent SDK

*(This section was reconstructed from the gap-fill pass — the primary sweep agent for this dimension crashed. All items below are
`verified-fetched` except the three repo links, which are search-result-only.)*

- **What it is**: Claude Code as a library — the same agent loop, built-in tools, and context management, programmable in
  TypeScript (`npm install @anthropic-ai/claude-agent-sdk`) and Python (`pip install claude-agent-sdk`, 3.10+). Single entry
  point: `query({prompt, options})`.
- **Tooling** [official]: `agent-sdk-dev` plugin — one command `/new-sdk-app` (interactive: language, project name, agent type,
  starting prompt; installs the latest SDK, writes starter files + `.env.example` + `tsconfig`, typechecks, then auto-runs a
  verifier) and two Sonnet verifier subagents `agent-sdk-verifier-ts` / `agent-sdk-verifier-py` that emit
  PASS / PASS WITH WARNINGS / FAIL. No skills, no hooks.
  https://github.com/anthropics/claude-plugins-official/tree/main/plugins/agent-sdk-dev
- **Docs**: overview https://code.claude.com/docs/en/agent-sdk/overview · quickstart
  https://code.claude.com/docs/en/agent-sdk/quickstart · plugins in the SDK https://code.claude.com/docs/en/agent-sdk/plugins ·
  hooks https://code.claude.com/docs/en/agent-sdk/hooks · tool search https://code.claude.com/docs/en/agent-sdk/tool-search
- **Reusing your plugins from the SDK**: there is **no `loadPlugins()` function**. Plugins load via the `options.plugins` array of
  `SdkPluginConfig` objects, and `type` must be `"local"` — the only accepted value. Marketplace plugins must be downloaded first
  and pointed at by local path. Loaded plugins contribute skills (namespaced `plugin-name:skill`), agents, hooks, and MCP servers.

  ```ts
  query({ prompt, options: { plugins: [{ type: 'local', path: './my-plugin' }] } })
  ```
- **Other option surfaces**: `systemPrompt: string | {type:'preset', preset:'claude_code', append?, excludeDynamicSections?}`
  (default is a *minimal* prompt, **not** Claude Code's); `hooks: Partial<Record<HookEvent, HookCallbackMatcher[]>>` (~20 events);
  `mcpServers` plus in-process `createSdkMcpServer()` / `tool()`. Tool search is **on by default** in the SDK (tunable via
  `ENABLE_TOOL_SEARCH=true|auto|auto:N|false` in `options.env`; unsupported on Haiku).
- **Repos**: https://github.com/anthropics/claude-agent-sdk-typescript · https://github.com/anthropics/claude-agent-sdk-python ·
  examples https://github.com/anthropics/claude-agent-sdk-demos

### Workflow

- **Tooling** [official]: **Dynamic Workflows** (v2.1.154+) — Claude writes a JS orchestration script that a background runtime
  executes, spawning up to 1,000 subagents (16 concurrent) with adversarial verification. Invoke via `/workflows`, the `ultracode`
  keyword, or `/effort ultracode`. Save a run (`s`) to `.claude/workflows/`, where it becomes a `/<name>` command. Bundled example:
  `/deep-research`.
- **Docs**: https://code.claude.com/docs/en/workflows · reasoning/effort https://code.claude.com/docs/en/model-config
- **Reference impls** [official plugins]: `feature-dev` (7-phase, 3 agents), `code-modernization` (richest `workflows/` dir +
  interactive HTML assets + approval gates), `math-olympiad` (context-isolated adversarial verification), `ralph-loop`
  (Stop-hook self-referential loop).
- Related orchestration primitives: Agent Teams (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`), `/goal` (work-until-condition),
  `/loop` (in-session cron), Routines (cloud, `/schedule`), Agent View (`claude agents`).

### Rarer plugin components (thin docs — one source: plugins-reference)

- **LSP** (`.lsp.json` / `lspServers`, not experimental): `command` + `extensionToLanguage` required. Scaffold with
  `claude plugin init --with lsp`. Reference: `Piebald-AI/claude-code-lsps` [community, 46 languages] —
  https://github.com/Piebald-AI/claude-code-lsps
- **Themes** (`themes/*.json`, experimental key): official docs show only `base` + 3 tokens. This repo's own `claude-catppuccin`
  is a complete worked example of the full ~60-token vocabulary.
- **Monitors** (`monitors/monitors.json`, experimental, v2.1.105+): background processes streaming stdout to Claude.
- **bin/**: any executable joins the Bash `PATH` (no schema).
- **subagentStatusLine**: the only status-line surface a plugin can ship (top-level `statusLine` is a user/project setting only).

---

## 3. The eval / validation / testing layer (the underused part)

Verified against the local CLI (v2.1.206). `claude plugin` exposes: `details`, `disable`, `enable`, `eval`, `init|new`,
`install|i`, `list`, `marketplace`, `prune|autoremove`, `tag`, `uninstall|remove`, `update`, `validate`.

| Tool | Type | What it checks | Invoke |
|---|---|---|---|
| `claude plugin validate --strict` [official] | Structural CLI | `plugin.json` + skill/agent/command frontmatter + `hooks/hooks.json`; `--strict` fails on warnings | `claude plugin validate ./p --strict` |
| `claude plugin eval` [official] | **Behavioral CLI** | runs `evals/**/case.yaml` (or `prompt.md` + `graders/*.md`); scores cases | `claude plugin eval ./p --json --threshold 0.8` |
| `claude plugin eval init` [official] | **Eval authoring** | interviews you, sources inputs, designs graders, writes `evals/`. `--bare <name>` for a blank template | `claude plugin eval init` |
| `claude plugin details <name>` [official] | Inventory | component inventory + **projected token cost** of a plugin | `claude plugin details my-plugin` |
| `plugin-validator` [official, plugin-dev agent] | LLM aggregate review | manifest, structure, per-component, README/LICENSE, security heuristics | "validate my plugin" |
| `skill-reviewer` [official, plugin-dev agent] | LLM skill review | description/trigger quality, progressive disclosure | "review my skill" |
| `run_eval.py` [official, skill-creator] | Trigger eval | does the description cause the skill to fire? precision/recall over N runs | `python -m scripts.run_eval …` |
| `run_loop.py` [official, skill-creator] | Description optimizer | train/holdout split; LLM-rewrites the description to cut false pos/neg | `python -m scripts.run_loop …` |
| `quick_validate.py` / `package_skill.py` [official] | Skill lint / package | structural check; zip a skill for distribution | `python -m scripts.quick_validate …` |
| `validate-agent.sh`, `validate-hook-schema.sh`, `hook-linter.sh`, `test-hook.sh` [official] | Per-component | deterministic checks `plugin-validator` delegates to | bundled in plugin-dev skills |

**`claude plugin eval` flags worth knowing** (all verified locally):
`--ablation none|with-without` (runs a no-plugin baseline arm and reports the score delta — **defaults to `with-without` when you
target a plugin by name**, `none` for a path), `--case <glob>`, `--tag <tag...>`, `--runs <n>` (default `case.runs ?? 3`),
`--threshold <0..1>` (exit 1 below threshold — CI gate), `--json` (emit `aggregate-result.json` to stdout),
`--judge-model <model>` (default haiku), `--model`, `--allow-tools`, `--scaffold` / `--no-scaffold` (runs author-supplied bash as
you — off by default), `--output-dir`, `--verbose`.

Docs: skill eval workflow + file schemas https://agentskills.io/skill-creation/evaluating-skills · skill-creator layout
https://github.com/anthropics/claude-plugins-official/tree/main/plugins/skill-creator · announcement
https://claude.com/blog/improving-skill-creator-test-measure-and-refine-agent-skills

Notes: skill-creator ships subagents `grader`/`comparator`/`analyzer` and an `eval-viewer` (`generate_review.py` + `viewer.html`;
the separate `assets/eval_review.html` is the template). `benchmark.json` rolls up with-skill vs without-skill pass-rate/tokens/time
with variance. There is **no** `claude plugin lint`, `package`, or `test` verb — `validate` (structural) + `eval` (behavioral) +
`tag` (release) cover it.

---

## 4. Distribution

- **Author a marketplace**: `.claude-plugin/marketplace.json`; required `name` / `owner` / `plugins[]`. Source types: relative
  path, `github`, `url`, `git-subdir` (sparse monorepo clone), `npm`. Docs: https://code.claude.com/docs/en/plugin-marketplaces
- **Consume**: `/plugin marketplace add <owner/repo>` → `/plugin install <name>@<marketplace>` → `/reload-plugins`.
  Scopes: user / project / local / managed. Docs: https://code.claude.com/docs/en/discover-plugins
- **Release**: `claude plugin tag --push -m 'release %s'` cuts a `{name}--v{version}` git tag, validating that `plugin.json` and
  any enclosing marketplace entry agree; `/plugin update` then resolves it. Plugin **dependencies** (semver ranges) via
  `dependencies` in `plugin.json`/entry (v2.1.110+); `claude plugin prune` removes orphaned auto-installed deps.
- **Recent marketplace/author knobs**: `defaultEnabled: false` (install disabled until the user opts in; v2.1.154) —
  https://code.claude.com/docs/en/plugins-reference#default-enablement · `skipLfs` for github/git sources (v2.1.153), documented
  **only** in https://code.claude.com/docs/en/settings · `relevance` signals + `pluginSuggestionMarketplaces` (managed-only
  allowlist) driving the Discover-tab "suggested for this directory" pin — https://code.claude.com/docs/en/plugin-relevance
- **Submit to Anthropic's directory**: third-party plugins go through https://clau.de/plugin-directory-submission (302 → the
  `plugins#submit-your-plugin-to-the-official-marketplace` docs anchor) and must pass quality + security review; they land under
  `/external_plugins`. Anthropic-internal plugins are team PRs against `/plugins` using `example-plugin` as the template.
  `claude-plugins-official` is a **reserved** marketplace name (as are `claude-plugins-community`, `claude-community`,
  `anthropic-plugins`).

---

## 5. Non-Anthropic tooling worth a look

Prefer official for the core loop; these genuinely complement it. Maintenance status as of mid-2026.

**Add to marketplace CI (SKILL.md validators):**

- **himself65/skill-lint** [community, active — May 2026] — frontmatter linter (name/description/reserved words/angle brackets),
  CLI + GitHub Action. https://github.com/himself65/skill-lint
- **agent-ecosystem/skill-validator** [community, active — Apr 2026, Go] — spec conformance + content-density/quality +
  link-checking. https://github.com/agent-ecosystem/skill-validator
- **claude-skill-check** [community, active] — frontmatter lint **plus a leaked-secret scan** (API keys, tokens, PEM) the others
  lack; CI Action. https://github.com/marketplace/actions/claude-skill-check

**Pattern references (study/borrow, not tooling):**

- **wshobson/agents** [community, very active — 37.7k★] — a real 92-plugin multi-harness marketplace generated from one source;
  best model for large-marketplace structure. https://github.com/wshobson/agents
- **VoltAgent/awesome-claude-code-subagents** [community, active — 154+ agents] — agent system prompts + taxonomy.
  https://github.com/VoltAgent/awesome-claude-code-subagents
- **Piebald-AI/claude-code-lsps** [community, active] — de-facto reference for `.lsp.json` authoring.
  https://github.com/Piebald-AI/claude-code-lsps

**Discovery / cross-tool distribution (crowded namespace — verify what you pull):**

- **hesreallyhim/awesome-claude-code** [community, active — 49.7k★] — canonical hand-curated index.
  https://github.com/hesreallyhim/awesome-claude-code
- **skills.sh** [community, Vercel-hosted] — "npm for skills," `npx skills add <repo>`. https://www.skills.sh/
- **pr-pm/prpm** [community, active] — cross-tool package registry that auto-converts to each target format; treat like npm.
  https://github.com/pr-pm/prpm

Runtime/monitoring tools (`ccusage`, `claude-code-router`, `cchistory`) are **adjacent, not authoring** — skip for building
plugins. `badlogic/cchistory` is stale since Oct 2025.

---

## 6. What does NOT exist / common misconceptions

- **"There's no scaffold CLI."** Wrong since v2.1.157: `claude plugin init` exists. There is no `claude skill init`, but
  `claude plugin init` produces a skill-dir plugin.
- **`/agents` creates agents.** Not since v2.1.198 — the creation wizard was removed. `claude agents` (Agent View) runs and
  monitors sessions; it doesn't author.
- **No `claude plugin lint` / `package` / `test`.** Use `validate --strict`, `eval`, `tag`. Packaging is manual (zip the dir; load
  via `--plugin-dir ./x.zip` or `--plugin-url`).
- **Output styles are dead.** The feature is alive (Default/Proactive/Explanatory/Learning + custom `.claude/output-styles/*.md`);
  only the standalone `/output-style` **command** was removed (v2.1.91). Use `/config` or the `outputStyle` setting. Ship one as a
  plugin via a SessionStart hook (see `explanatory-output-style` / `learning-output-style`).
- **Custom slash commands are a separate system.** They are merged into skills.
- **Agent Skills is governed by a Linux Foundation "Agentic AI Foundation."** **Refuted** — no primary source. Agent Skills is an
  Anthropic-originated open standard (published 2025-12-18) at agentskills.io, open to community contribution, with no named
  foundation.
- **`anthropics/claude-plugins-public` is a third repo.** No — it 301-redirects to `claude-plugins-official`. It is the old name.
- **`mcp-apps` doesn't exist as a plugin.** It does — `mcp-apps@claude-plugins-official`, vendored via `git-subdir` from
  `modelcontextprotocol/ext-apps` (the repo directory 404s because the content is external).
- **The SDK has a `loadPlugins()` function.** It doesn't. Use `options.plugins: [{type:'local', path}]`.
- **Install plugin-dev from `anthropics/claude-code`.** That copy is **frozen at 2025-11-17** and its README still says
  `plugin-dev@claude-code-marketplace`, version 0.1.0. Install from `claude-plugins-official` (rolling, git-SHA pinned).
- **A distributed plugin phones telemetry home to its author.** No. First-party OpenTelemetry is real and rich (`skill_activated`,
  hook lifecycle, `plugin_loaded`, error events, per-skill `cost.usage` / `token.usage`), but it exports to the **operator's**
  collector, not the author's. `hook_plugin_metrics` is gated to official-Anthropic-marketplace plugins; custom metric names are
  redacted to "custom" unless `OTEL_LOG_TOOL_DETAILS=1`. The Analytics Admin API is org-scoped with no per-skill/plugin breakdown.
- **"Agent Fleet / FleetView" is an Anthropic feature.** No — community naming. The official feature is **Agent View**
  (`claude agents`).
- **A generic `.claude/workflows` scripting feature exists.** The only `.claude/workflows/` is where saved Dynamic Workflow
  scripts land.
- **`pluginConfigs` setting** — could not be independently confirmed; treat as unverified.

---

## 7. Recommendations for this repo (8 plugins; plugin-dev + skill-creator already installed)

1. **Wire the whole-plugin lifecycle into CI.** Add `claude plugin validate --strict` as a required check across all 8 plugins
   (it is what the official submission pipeline runs), and adopt **`claude plugin eval`** with `--json --threshold` for behavioral
   regression — including `--ablation with-without` to prove each plugin actually changes behavior. Bootstrap the suites with
   `claude plugin eval init`. Layer the community SKILL.md linters on top, especially **claude-skill-check** for its secret scan,
   since our skills ship scripts.

2. **Measure the skills, don't just author them.** skill-creator is probably only being used for creation. Commit a per-skill
   `evals/trigger_eval.json` (the `{"query","should_trigger"}` format `math-olympiad` ships), run `run_eval.py` for trigger
   precision/recall and `run_loop.py` to auto-tune descriptions. Cheap insurance against "my skill never fires / fires on
   everything" — a real risk given how many overlapping review skills `project-quality` exposes.

3. **Migrate `commands/` → `skills/<name>/SKILL.md`.** Any plugin still built on `commands/` is on the legacy path. Skills unlock
   `disable-model-invocation`, `context: fork`, `paths`, and bundled resource dirs. Set `disable-model-invocation: true` on
   side-effecting commands (`/commit`, `/clean_gone`).

4. **Audit the agent frontmatter.** Our subagent tooling (`agent-creator`, `agent-development`, `validate-agent.sh`) is ~11 fields
   behind the current `sub-agents` spec. Check the agents in `grill`, `project-quality`, and `tasks` against the docs — fields like
   `isolation: worktree`, `effort`, `maxTurns`, and `disallowedTools` are available and unused.

5. **Adopt the newer marketplace knobs.** `defaultEnabled: false` on plugins that shouldn't auto-enable; `claude plugin tag --push`
   for versioned releases; declare inter-plugin `dependencies`; add a `relevance` block per entry for directory-aware Discover-tab
   pinning. Also run `claude plugin details <name>` on each — it reports projected token cost, which matters for the ones that
   ship many skills.

---

## Appendix: provenance and confidence

Produced by a 36-agent workflow: 12 parallel research sweeps → per-dimension adversarial fact-checking (every URL re-fetched) →
2 completeness critics → 10 gap-fill agents → synthesis. ~2.6M tokens, 635 tool calls.

Known degradations, and how they were handled:

- The **Agent SDK** sweep crashed (structured-output retry cap). Its content was recovered from a 15-item gap-fill agent and is
  marked as such in §2.
- The **subagents** sweep returned a placeholder stub (`"probe"`). Its content was recovered from an 8-item gap-fill agent.
- One gap-fill agent (re-verifying the hook event surface) also returned a stub. That claim is instead corroborated by a separate
  22-item hook-surface fill.
- Two gap questions were dropped by a `slice(0, 10)` in the workflow script: skill/command `disallowed-tools` frontmatter
  semantics, and subagent background/nesting semantics. **Not researched.**

Claims about the `claude plugin` CLI in §3 were verified directly against the local binary (v2.1.206), not from the web.
Anything the fact-checkers refuted was moved to §6 rather than deleted.
