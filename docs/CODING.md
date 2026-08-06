# Coding Guide

Implementation guide for contributing to this plugin marketplace.

## Adding a new plugin

1. Create `plugins/<plugin-name>/` with the standard layout (see [OVERVIEW.md](OVERVIEW.md) for the directory tree).
2. Write `.claude-plugin/plugin.json` — required fields: `name`, `version`, `description`, `author`. Set `version` to whatever `.claude-plugin/marketplace.json` `metadata.version` already carries, not `1.0.0`: all plugins ship in lockstep under one repo tag (see [RELEASING.md](RELEASING.md)), and `mise run check-consistency` fails on more than one distinct version string in the repo.
3. Register the plugin in `.claude-plugin/marketplace.json` under the `plugins` array with fields: `name`, `source`, `description`, `version`, `author`, `category`, `keywords`. The `description` must be **byte-identical** to the one in `plugin.json`, and `version` must match it too — `mise run check-consistency` compares both and the CI `consistency` job runs it.
4. Add the plugin to the table in `README.md`.
5. Use the `plugin-dev` skill set to scaffold components: commands, skills, agents, hooks, MCP integration. `plugin-dev` ships in an external plugin and must be installed separately — see [TESTING.md](TESTING.md) for install instructions.

## Keeping plugin artifacts portable

A plugin's skills, agents, and workflows run in whatever repository the user installs them into. Write them
against what every project has — the working tree, git, the harness's own tools — and never against this
repository's layout, its `plugins/` tree, or a stack the target project may not use.

A dependency on a specific technology is allowed when it is declared rather than assumed:

- Another plugin → `dependencies` in `plugin.json` (see below).
- A CLI tool or runtime → a load-time availability check that stops with guidance when it is missing (see below).
- A whole platform → the plugin is named for it, so the constraint is visible before install.
  `keep-awake-linux` is the worked example: logind and `systemd-inhibit` are the point of the plugin, and its
  test suite skips rather than fails where they are absent ([TESTING.md](TESTING.md)).

What this rules out is the undeclared assumption — a skill that greps `plugins/`, hard-codes `mise`, or expects
a `docs/` layout it never checks for.

## Declaring plugin dependencies

The `plugin.json` `dependencies` field is honored by the Claude Code marketplace harness — when a user installs a plugin that declares dependencies, the harness auto-installs each listed plugin at the same scope as the parent. Full behavior is documented at https://code.claude.com/docs/en/plugin-dependencies.

**Declare dependencies in bare-name form only** (`"dependencies": ["instruction-writing"]`). A version constraint resolves against per-plugin `<name>--vX.Y.Z` tags, which this marketplace's single-repo-tag release policy never creates ([RELEASING.md](RELEASING.md)), so a constrained dependency here can never be satisfied. Nothing in CI catches a constrained entry — the install fails on the user's machine.

Use the right pattern for each dependency kind:

- **Plugin depends on another plugin** (e.g. a workflow plugin that reuses another plugin's skills): declare the dependency in `plugin.json` under `dependencies`. The harness handles install, scope, and chained enable/disable.
- **Plugin depends on a CLI tool** (e.g. `tasks` → `taskmgr`, `html-visualization` → `node`): the harness cannot install CLI binaries. Add a runtime check at skill load time (Phase 0) that tests whether the CLI is present and stops with guidance if it is missing. Do not add CLI tools to the `dependencies` field.

## Locating a plugin's own files at runtime

A skill that has to run one of its plugin's bundled files (a workflow script, a server, a
Python helper) needs that file's absolute path. **The harness already supplies it:** every
skill is loaded with a `Base directory for this skill: <absolute path>` line, and that path
is correct in every install shape — a dev checkout, a `--plugin-dir` run, and a cached
install under `$HOME/.claude/plugins/<marketplace>/<plugin>/<version>/`. Build the path you
need from it:

```
<base directory for this skill>/workflows/<the-file-you-need>
```

Two layouts exist, so check where the file actually sits before building the path
(see [OVERVIEW.md](OVERVIEW.md)): a workflow owned by one skill lives under that skill, as
above — every workflow in the marketplace currently does. One shared beyond a single skill
sits at the plugin root instead and is reached with
`<base directory for this skill>/../../<dir>/<the-file-you-need>`. `html-visualization` is
the worked example: its three mode skills all run `bin/server.js`, so the shared
`references/serve.md` climbs `../..` from the `html-visualize` library's base directory.
State in the skill that the plugin-root layout applies, or the `../..` reads as a mistake.

Do not search the filesystem for the plugin. A `find`-based resolution is not just redundant,
it is worse than the value the harness hands you: it can select a stale cached version or a
long-dead copy of the plugin, and — because shell state does not persist between `Bash` tool
calls — a path it assigns to a variable is gone before the next command runs, so print any
path you compute rather than only assigning it.

**`$CLAUDE_PLUGIN_ROOT` is a plugin-config token.** It is substituted in hook commands and
`settings.json`, not exported into the environment of `Bash` tool calls. Use the base
directory instead.

When a needed file is genuinely missing, stop and tell the user — never improvise a path.

### Reaching another plugin's files

`../..` stops at the plugin root. A **sibling plugin's** install directory is not derivable
from this one's — the two are versioned separately in a cached install and unversioned in a
dev checkout — so there is no relative path to write and `find` is worse than useless here.

- Load the sibling's skill and take the `Base directory for this skill:` line it prints. That
  value is the sibling's install directory, correct in every install shape.
- Pass it into whatever needs it — a workflow arg, a script flag — and validate it at that
  boundary rather than letting a missing one degrade silently.
- Declare the dependency in `plugin.json` so the harness installs the sibling, and say in the
  skill what to do when it is absent — a missing dependency is a broken install, not an
  optional extra.

`project-review:project-review-docs` is the worked example: it loads
`instruction-writing:writing-project-docs` for the authoring standard, passes the result as
`standardDir`, and its workflow rejects a missing or relative value before spawning an agent.

## Shell scripts

Every tracked `*.sh` — under `scripts/`, `tests/`, or bundled in a plugin's `bin/` — must pass `mise run lint` (ShellCheck `--severity=warning`). A plugin `bin/` script without a `.sh` extension (e.g. `keep-awake-linux`'s `bin/keep-awake`) is still covered: `scripts/list-shell-scripts.sh` finds it by shebang rather than extension, so it does not need renaming to be linted. The CI `shellcheck` job enforces it; see [TESTING.md](TESTING.md) for the full job list.

## SKILL.md conventions

These apply to every `SKILL.md` under `plugins/<plugin-name>/skills/<skill-name>/`.

Before writing or editing any `SKILL.md`, read the `writing-skills` rubric at
[`plugins/instruction-writing/skills/writing-skills/SKILL.md`](../plugins/instruction-writing/skills/writing-skills/SKILL.md) —
invocation choice, description writing, information hierarchy, and pruning.

After writing or revising one, the `plugin-dev:skill-reviewer` agent reviews a `SKILL.md` for
trigger description quality, progressive disclosure, and content organisation — it catches weak
trigger phrases, over-long bodies, and missing references. It is a development-time aid, **not**
a release gate (only `plugin-dev:plugin-validator` is). Like the validator it ships in the
external `plugin-dev` plugin and must be installed separately — see [TESTING.md](TESTING.md).

```
Review the skill at plugins/my-plugin/skills/my-skill/SKILL.md
```

### Naming

Skill directory name and the `name:` field in frontmatter must match. **Sibling skills share one prefix** so they sort and read as a family: the plugin's domain word where the plugin has one (`keep-awake-`, `html-visualize-`, `project-review-`, `tasks-`), otherwise a family word the siblings agree on (`writing-` in `instruction-writing`, `test-` in `project-auto-work`). A "main" skill may take the plugin's own name instead (`github-releases:github-releases`).

- ✅ `keep-awake-linux:keep-awake-inspect`, `html-visualization:html-visualize-ask`, `instruction-writing:writing-skills`
- ❌ `keep-awake-linux:inspect` — bare verb, shared with no sibling

The exception is a plugin whose skill names do the triggering on their own — each a distinct, self-sufficient concept rather than a generic operation like `inspect` — where a shared prefix would only dilute them (`challenge:grill`, `challenge:kiss`, `challenge:are-you-sure`). Either way, the qualified `<plugin>:<skill>` reference still carries the domain in its plugin segment.

**Renaming a plugin directory or a skill:** add the old-to-new entry to `RENAME_ALIASES` / `SKILL_RENAME_ALIASES` in [`scripts/analyze-sessions.py`](../scripts/analyze-sessions.py) in the same change, or every historical episode for that name silently falls into the unmatched bucket (see [MONITORING.md](MONITORING.md)).

### Frontmatter — pick a schema by invocation behaviour

A skill is either **user-only** (must not auto-trigger) or **model-discoverable** (the model should auto-invoke it from conversation context). Pick the schema that matches the skill's intent.

**Schema A — user-only:**

```yaml
---
name: <skill-name>
description: "<one-line summary>"
user-invocable: true
disable-model-invocation: true
---
```

This is the default schema — nearly every skill in the marketplace uses it.

**Schema B — model-discoverable:**

```yaml
---
name: <skill-name>
description: "<one-line summary>"
when_to_use: "Use when … Triggers on '…', '…'. Does not apply to …"
---
```

Use for skills the `Skill` tool must reach, for either of two reasons — sibling skills or agents load them by name (`tasks:tasks-writing`, loaded by `tasks-create`; `instruction-writing:writing-project-docs`, loaded by `project-review:project-review-docs`), or the agent should fire them unprompted from conversation context (`challenge:grill` when a plan still carries open decisions, `writing-skills` when a `SKILL.md` is being written). `when_to_use` carries the trigger guidance — write positive triggers, exclusions, and (where it helps) the argument shape.

Default to Schema A; use Schema B only for the two reasons above. Do not reach for it just because a skill *could* be auto-invoked — measured pickup from context is low (see the Invocation modes table in [MONITORING.md](MONITORING.md)), so the cost is paid on every skill that takes it without needing it.

When the new skill's domain overlaps a sibling's (a likely case within a `*`-family), disambiguate in **both** directions: exclude the sibling from this skill's `when_to_use` *and* add the reverse pointer to the sibling's `when_to_use` in the same change. A one-sided carve-out still lets the shared queries land on the wrong skill.

**Reference libraries** are skill folders loaded *by* sibling skills, not invoked directly. They use `user-invocable: false` and omit `when_to_use`. Examples: `html-visualize`.

Do not mix schemas — a skill with both `disable-model-invocation: true` and `when_to_use:` is contradictory.

### `argument-hint` and `$ARGUMENTS`

A skill that takes an argument declares `argument-hint` in its frontmatter and consumes
`$ARGUMENTS` in its body. The two travel together: a hint with no `$ARGUMENTS` advertises an
argument the skill then ignores, and `$ARGUMENTS` with no hint hides that the skill takes one.

```yaml
argument-hint: "[what-to-review]"
```

Keep the hint a short bracketed placeholder — it appears in the slash-command picker, where a
long value is truncated. Name the shape, not a description of it (`[what-to-review]`) — that
duplicates prose the body already owns and goes stale independently of it.

Exception: an **enum-valued** argument (a fixed, closed set of literal tokens, like a level)
spells out the values instead — `[low|medium|high|ultra]`, not the generic `[level]`.

State what happens when the argument is empty, since a user-invoked skill is frequently
invoked bare. Either default it ("with no argument, review the whole test suite") or ask.
