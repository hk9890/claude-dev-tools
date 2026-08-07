# Coding Guide

Rules for creating or changing files in this plugin marketplace.

## Adding a new plugin

1. Create `plugins/<plugin-name>/` with the layout in [OVERVIEW.md](OVERVIEW.md).
2. Write `.claude-plugin/plugin.json` with `name`, `version`, `description`, `author`. Set `version` to whatever `.claude-plugin/marketplace.json` `metadata.version` already carries, not `1.0.0` — all plugins ship in lockstep under one repo tag ([RELEASING.md](RELEASING.md)), and `mise run check-consistency` fails on a second distinct version string.
3. Register it in `.claude-plugin/marketplace.json` under `plugins` with `name`, `source`, `description`, `version`, `author`, `category`, `keywords`. `description` must be **byte-identical** to `plugin.json`'s and `version` must match it — the CI `consistency` job compares both.
4. Add a row to the plugin table in `README.md`, in `marketplace.json` order.
5. Scaffold components with the `plugin-dev` skill set — an external plugin, installed separately ([TESTING.md](TESTING.md)).

## Portability

A plugin's skills, agents, and workflows run in whatever repository the user installs them into. Write them against what every project has — the working tree, git, the harness's own tools. What this rules out is the undeclared assumption: a skill that greps `plugins/`, hard-codes `mise`, or expects a `docs/` layout it never checks for.

Depend on a specific technology only where the dependency is declared:

- Another plugin → `dependencies` in `plugin.json` (below).
- A CLI tool or runtime → a load-time check that stops with guidance when it is missing (below).
- A whole platform → name the plugin for it, so the constraint is visible before install. `keep-awake-linux` is the worked example: logind is the point of the plugin, and its suite skips rather than fails where it is absent ([TESTING.md](TESTING.md)).

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
- Never `find` the plugin: it can select a stale cached version, and shell state does not persist between `Bash` calls, so a path assigned to a variable is gone by the next command. Print any path you compute.
- `$CLAUDE_PLUGIN_ROOT` is substituted in hook commands and `settings.json` only — it is not in a `Bash` call's environment.
- Stop and tell the user when a needed file is missing; never improvise a path.

### Reaching another plugin's files

`../..` stops at the plugin root, and a sibling's install directory is not derivable from this one's — versioned separately in a cached install, unversioned in a dev checkout.

- Load the sibling's skill and take the `Base directory for this skill:` line it prints.
- Pass that value in explicitly (a workflow arg, a script flag) and validate it at that boundary.
- Declare the sibling in `dependencies`, and say in the skill what to do when it is absent — a missing dependency is a broken install, not an optional extra.

`project-review:project-review-docs` is the worked example: it loads `instruction-writing:writing-project-docs`, passes the base directory as `standardDir`, and rejects a missing or relative value before spawning an agent.

## Shell scripts

Every tracked `*.sh` — under `scripts/`, `tests/`, or a plugin's `bin/` — must pass `mise run lint` ([TESTING.md](TESTING.md)). An extensionless `bin/` script is still covered: `scripts/list-shell-scripts.sh` finds it by shebang, so `keep-awake-linux`'s `bin/keep-awake` needs no rename.

## SKILL.md conventions

For every `SKILL.md` under `plugins/<plugin-name>/skills/<skill-name>/`. The authoring rubric — invocation choice, description writing, information hierarchy, pruning — is [`plugins/instruction-writing/skills/writing-skills/SKILL.md`](../plugins/instruction-writing/skills/writing-skills/SKILL.md); read it first, and run `plugin-dev:skill-reviewer` on the result afterwards (a dev-time aid, not a release gate — only `plugin-dev:plugin-validator` is; both ship in the external `plugin-dev` plugin, [TESTING.md](TESTING.md)):

```
Review the skill at plugins/my-plugin/skills/my-skill/SKILL.md
```

### Naming

Directory name and frontmatter `name:` must match. **Sibling skills share one prefix** so they sort and read as a family: the plugin's domain word where it has one (`keep-awake-`, `html-visualize-`, `project-review-`, `tasks-`), otherwise a word the siblings agree on (`writing-` in `instruction-writing`, `test-` in `project-auto-work`). A "main" skill may take the plugin's own name (`github-releases:github-releases`).

- ✅ `keep-awake-linux:keep-awake-inspect`, `instruction-writing:writing-skills`
- ❌ `keep-awake-linux:inspect` — bare verb, shared with no sibling

The exception is a plugin whose names trigger on their own, each a distinct concept rather than a generic operation, where a shared prefix would only dilute them (`challenge:grill`, `challenge:kiss`, `challenge:are-you-sure`).

**When renaming a plugin directory or a skill**, add the old-to-new entry to `RENAME_ALIASES` / `SKILL_RENAME_ALIASES` in [`scripts/analyze-sessions.py`](../scripts/analyze-sessions.py) in the same change, or that name's history silently falls into the unmatched bucket ([MONITORING.md](MONITORING.md)).

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

**Schema B — model-discoverable.** Only where the `Skill` tool must reach the skill: siblings or agents load it by name (`tasks:tasks-writing`, `instruction-writing:writing-project-docs`), or the model should fire it unprompted from context (`challenge:grill`, `writing-skills`). `when_to_use` carries positive triggers, exclusions, and the argument shape where it helps.

```yaml
---
name: <skill-name>
description: "<one-line summary>"
when_to_use: "Use when … Triggers on '…', '…'. Does not apply to …"
---
```

- Do not take Schema B just because a skill *could* auto-invoke: measured pickup from context is low (the Invocation modes section in [MONITORING.md](MONITORING.md)), and every skill that takes it pays the cost.
- Never mix them — `disable-model-invocation: true` alongside `when_to_use:` is contradictory.
- Where a Schema B skill's domain overlaps a sibling's, disambiguate in **both** directions in the same change: exclude the sibling here, add the reverse pointer there. A one-sided carve-out still lets shared queries land on the wrong skill.

### `argument-hint` and `$ARGUMENTS`

Declare `argument-hint` and consume `$ARGUMENTS` together, or the skill advertises an argument it ignores — or hides one it takes.

```yaml
argument-hint: "[what-to-review]"
```

- Name the shape in a short bracketed placeholder; the slash-command picker truncates anything longer.
- Spell out an **enum-valued** argument instead: `[low|medium|high|ultra]`, not `[level]`.
- State what an empty argument does — default it ("with no argument, review the whole test suite") or ask.
