# Coding Guide

What a change to this plugin marketplace needs in order to work.

## Adding a new plugin

1. Create `plugins/<plugin-name>/` with the layout in [OVERVIEW.md](OVERVIEW.md). Name it for what it does: `claude plugin validate` refuses a name that starts with `claude-`, `anthropic-` or `cc-plugin-`.
2. Write `.claude-plugin/plugin.json` with `name`, `version`, `description`, `author`. Set `version` to whatever `.claude-plugin/marketplace.json` `metadata.version` already carries, not `1.0.0` — all plugins ship in lockstep under one repo tag ([RELEASING.md](RELEASING.md)), and `mise run check-consistency` fails on a second distinct version string.
3. Register it in `.claude-plugin/marketplace.json` under `plugins` with `name`, `source`, `description`, `version`, `author`, `category`, `keywords`. `description` must be **byte-identical** to `plugin.json`'s and `version` must match it — the CI `consistency` job compares both.
4. Add a row to the plugin table in `README.md`, in `marketplace.json` order.
5. Scaffold components with the `plugin-dev` skill set — an external plugin, installed separately ([TESTING.md](TESTING.md)).

## Renaming a plugin

The new name obeys step 1 of [Adding a new plugin](#adding-a-new-plugin). Add the old-to-new entry to the top-level `renames` map in `.claude-plugin/marketplace.json`. Claude Code follows it when an installed name is no longer found and migrates the user's `enabledPlugins`; without it every existing install loses the plugin, and no gate catches the omission. Rename every `<old-name>:<skill>` reference and every `dependencies` entry that names the plugin: `mise run check-consistency` checks only references to plugins that exist, and nothing checks `dependencies`. The release notes carry the rename ([RELEASING.md](RELEASING.md#release-notes)).

## Adding a canonical doc

Register a new canonical topic doc in three plugins; each keeps its own copy, as no plugin can import another:

1. `instruction-writing`, under `plugins/instruction-writing/skills/writing-project-docs/`: the name in the `## Canonical topic set` block and an ownership block (Audience, Inside, Not inside) in `references/project-setup.md`, a worked example at `examples/docs/<NAME>.md`, and a route in `examples/AGENTS.md`.
2. `project-review`, under `plugins/project-review/skills/project-review-docs/`: the name in `CANONICAL_DOCS` in `scripts/manifest.py`, in topic-set order, one use case in `USE_CASE_DOCS` in `scripts/history.py` and in `USE_CASES` in `workflows/review-docs.js`, and the name in the canonical-topic list of the NON-STANDARD prompt in `workflows/review-docs.js`.
3. `project-execute`: a row in the earned-topic table of `plugins/project-execute/skills/project-exec-init/SKILL.md`. Without it `/project-exec-init` never writes the doc.

`tests/marketplace/script-tests/test-canonical-docs.sh` pins the topic set, the ownership blocks, the examples and `USE_CASE_DOCS` to `CANONICAL_DOCS`; `tests/project-review/script-tests/test-history.sh` pins `USE_CASES` to `USE_CASE_DOCS`. No test checks the example route, the NON-STANDARD prompt list or the exec-init row.

## Portability

A plugin's skills, agents, and workflows run in whatever repository the user installs them into. Write them against what every project has — the working tree, git, the harness's own tools. What this rules out is the undeclared assumption: a skill that greps `plugins/`, hard-codes `mise`, or expects a `docs/` layout it never checks for.

Depend on a specific technology only where the dependency is declared:

- Another plugin → `dependencies` in `plugin.json` (below).
- Another plugin, used only where it is installed → no entry: check that its skill is in the session's available skills, and state what the caller does without it. `worktree-flow:worktree-review` is the worked example: where `project-review-change` is absent, it reports the rules review as skipped.
- A user-only skill of another plugin, offered to the user → no entry and no check, because a user-only skill is never in the available skills: print its slash command for the user to type, and name the plugin it needs. `project-review`'s `decision-split.md` is the worked example.
- A CLI tool or runtime → a load-time check that stops with guidance when it is missing (below).
- A whole platform → name the plugin for it, so the constraint is visible before install. `keep-awake-linux` is the worked example: logind is the point of the plugin, and where `systemd-inhibit` is absent its mod holds nothing and says so once in a toast.

## Declaring plugin dependencies

The harness auto-installs every plugin listed in `plugin.json`'s `dependencies` at the parent's scope, and chains enable/disable ([full behavior](https://code.claude.com/docs/en/plugin-dependencies)).

- **Bare names only** — `"dependencies": ["instruction-writing"]`. A version constraint resolves against per-plugin `<name>--vX.Y.Z` tags, which the single-repo-tag policy ([RELEASING.md](RELEASING.md)) never creates; nothing in CI catches it and the install fails on the user's machine.
- **A CLI tool is not a dependency** — `tasks` → `taskmgr`, `html-visualization` → `node`. The harness installs no binaries: check at skill load (Phase 0) and stop with guidance when absent.

## Locating a plugin's own files at runtime

Every skill is loaded with a `Base directory for this skill: <absolute path>` line, correct in every install shape — dev checkout, `--plugin-dir` run, cached install under `$HOME/.claude/plugins/<marketplace>/<plugin>/<version>/`. Build paths from it:

```
<base directory for this skill>/workflows/<the-file-you-need>
```

- Check which of the two layouts holds the file ([OVERVIEW.md](OVERVIEW.md)). A workflow owned by one skill sits under that skill — every workflow here currently does.
- One shared beyond a single skill sits at the plugin root, reached with `<base directory for this skill>/../../<dir>/<file>`; say in the skill that the plugin-root layout applies, or the `../..` reads as a mistake. Shared content takes this layout rather than a skill of its own — a skill costs a row in every session's skill index. `html-visualization` is the worked example — its three mode skills all read `references/` and run `bin/server.js` from the plugin root, so each climbs `../..` from its own base directory; `instruction-writing` and `project-review` share `references/` the same way.
- Never `find` the plugin: it can select a stale cached version. Print the path you build ([State across `Bash` calls](#state-across-bash-calls)).
- `$CLAUDE_PLUGIN_ROOT` is substituted in hook commands and `settings.json` only — it is not in a `Bash` call's environment.
- Stop and tell the user when a needed file is missing; never improvise a path.

### Reaching another plugin's files

`../..` stops at the plugin root, and a sibling's install directory is not derivable from this one's — versioned separately in a cached install, unversioned in a dev checkout.

- Call the Skill tool with the sibling's skill, even where it loaded earlier in the session, and take the `Base directory for this skill:` line it prints. Where it answers that the skill is already loaded, it prints no such line: take the line of that earlier load.
- Pass that value in explicitly (a workflow arg, a script flag) and validate it at that boundary.
- Declare the sibling in `dependencies`, and say in the skill what to do when it is absent — a missing dependency is a broken install, not an optional extra.

`project-review:project-review-docs` is the worked example: it calls the Skill tool with `instruction-writing:writing-project-docs`, passes the base directory as `standardDir`, and rejects a missing or relative value before spawning an agent.

## State across `Bash` calls

Each `Bash` call starts a fresh shell: a variable a skill assigns in one call is empty in the next.

- Print every value a later step needs — a path, a temp dir — and name it in later steps with one placeholder, defined at the step that prints it. `test-tests`' `<scratch>` is the worked example.
- Stop a process started with `run_in_background` by calling `TaskStop` with the task id the start returned. No later shell holds its PID. `html-visualization`'s `serve.md` is the worked example.

## Mods

A mod is a plugin whose `hooks/hooks.json` names a hooks module under `modules`; Claude Code 2.1.287 and later runs it in-process. Claude Code's built-in `plugin-authoring` skill carries the API and the write-validate-test loop: call the Skill tool with `plugin-authoring` before the first edit. **Local delta:**

- **Worked examples** — `keep-awake-linux` (a child process, timers, and a pane a timer refreshes), `worktree-flow` (a `tool.call` guard), `tasks` (a command, a pane, and a `$.state` contract).
- **Layout** — `hooks/hooks.json` holds `{ "modules": ["./register.ts"] }`, `.tsx` when the module draws. Tests go in `plugins/<plugin>/tests/*.test.ts`, where `claude plugin test` reads them ([TESTING.md](TESTING.md)). A module that keeps `$.state` values declares them in `types/index.d.ts`, named in `plugin.json` as `"types"`.
- **One code path** — a behaviour moves to the module whole: delete the settings hook and its `bin/` script in the same change.
- **Validate early** — run `claude plugin validate plugins/<plugin>` after every edit. It refuses an event name that is not a string literal, a `$` call not written in full (`$.ui.status(...)`, never `const ui = $.ui`), and `$` passed anywhere but a top-level function of the same file.
- **Footprint** — a mod runs unsandboxed, so reach only the `$` namespaces the feature needs; the `calls:` line `claude plugin validate` prints is the footprint a user audits before installing.
- **Where nothing draws** — panes and the status line show in the terminal and the desktop app only. Do not settle it at `session.start`: the desktop app joins after it, with a `session.attach` event, and can leave. Read `$.session.surfaces()` when the feature runs: `tasks` does at each `/tasks-board` and answers as text where neither is attached.
- **Command names** — a name registered with `$.command.register` is global. Lead it with the plugin's domain word (`tasks-board`); `/tasks` is Claude Code's own.
- **Generated files** — a `--plugin-dir` load writes `.claude-plugin/types/` and `tsconfig.json` into the plugin; both are gitignored. After one such load, `npx -p typescript tsc -p plugins/<plugin>` type-checks the module and its tests.

## SKILL.md conventions

For every `SKILL.md` under `plugins/<plugin-name>/skills/<skill-name>/`. The authoring rubric — invocation choice, description writing, information hierarchy, pruning — is [`plugins/instruction-writing/skills/writing-skills/SKILL.md`](../plugins/instruction-writing/skills/writing-skills/SKILL.md); read it first.

### Naming

Directory name and frontmatter `name:` must match. **Sibling skills share one prefix** so they sort and read as a family: the plugin's domain word where it has one (`worktree-`, `html-visualize-`, `project-review-`, `tasks-`), otherwise a word the siblings agree on (`writing-` in `instruction-writing`, `test-` in `project-auto-work`). A "main" skill may take the plugin's own name (`github-releases:github-releases`).

- ✅ `worktree-flow:worktree-ship`, `instruction-writing:writing-skills`
- ❌ `worktree-flow:ship` — bare verb, shared with no sibling

The exception is a plugin whose names trigger on their own, each a distinct concept rather than a generic operation, where a shared prefix would only dilute them — every skill in `challenge` (`grill`, `kiss`, `are-you-sure`, `what-do-you-mean`).

### Frontmatter

**Schema A — user-only.** The default; nearly every skill here uses it.

```yaml
---
name: <skill-name>
description: "<one-line summary>"
user-invocable: true
disable-model-invocation: true
---
```

**Schema B — model-discoverable.** Only where the `Skill` tool must reach the skill: siblings or agents load it by name (`tasks:tasks-core`, `instruction-writing:writing-project-docs`), or the model should fire it unprompted from context (`writing-skills`). A skill another skill only offers to the user stays Schema A ([Portability](#portability)). `when_to_use` carries positive triggers, exclusions, and the argument shape where it helps.

```yaml
---
name: <skill-name>
description: "<one-line summary>"
when_to_use: "Use when … Triggers on '…', '…'. Does not apply to …"
---
```

- Do not take Schema B just because a skill *could* auto-invoke: measured pickup from context is low (the Model-invoked column of a review run's `usage.md`, [MONITORING.md](MONITORING.md)), and every skill that takes it pays the cost.
- Never mix them — `disable-model-invocation: true` alongside `when_to_use:` is contradictory.
- Where a Schema B skill's domain overlaps a sibling's, disambiguate in **both** directions in the same change: exclude the sibling here, add the reverse pointer there. A one-sided carve-out still lets shared queries land on the wrong skill.

### `argument-hint` and `$ARGUMENTS`

Declare `argument-hint` and consume `$ARGUMENTS` together, or the skill advertises an argument it ignores — or hides one it takes.

```yaml
argument-hint: "[what-to-review]"
```

State what an empty argument does — default it ("with no argument, review the whole test suite") or ask.
