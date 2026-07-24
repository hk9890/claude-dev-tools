# Coding Guide

Implementation guide for contributing to this plugin marketplace.

## Adding a new plugin

1. Create `plugins/<plugin-name>/` with the standard layout (see [OVERVIEW.md](OVERVIEW.md) for the directory tree).
2. Write `.claude-plugin/plugin.json` — required fields: `name`, `version`, `description`, `author`.
3. Register the plugin in `.claude-plugin/marketplace.json` under the `plugins` array with fields: `name`, `source`, `description`, `version`, `author`, `category`, `keywords`.
4. Add the plugin to the table in `README.md`.
5. Use the `plugin-dev` skill set to scaffold components: commands, skills, agents, hooks, MCP integration. `plugin-dev` ships in an external plugin and must be installed separately — see [TESTING.md](TESTING.md) for install instructions.

## Declaring plugin dependencies

The `plugin.json` `dependencies` field is honored by the Claude Code marketplace harness — when a user installs a plugin that declares dependencies, the harness auto-installs each listed plugin at the same scope as the parent. Semver constraints are supported and enforced. Full behavior is documented at https://code.claude.com/docs/en/plugin-dependencies.

Use the right pattern for each dependency kind:

- **Plugin depends on another plugin** (e.g. a workflow plugin that reuses another plugin's skills): declare the dependency in `plugin.json` under `dependencies`. The harness handles install, scope, and chained enable/disable.
- **Plugin depends on a CLI tool** (e.g. `project-explore` → `taskmgr`, `html-visualization` → `node`): the harness cannot install CLI binaries. Add a runtime check at skill load time (Phase 0) that tests whether the CLI is present and stops with guidance if it is missing. Do not add CLI tools to the `dependencies` field.

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

Do not search the filesystem for the plugin. A `find`-based resolution is not just redundant,
it is worse than the value the harness hands you: it can select a stale cached version or a
long-dead copy of the plugin, and — because shell state does not persist between `Bash` tool
calls — a path it assigns to a variable is gone before the next command runs.

Two related points:

- **`$CLAUDE_PLUGIN_ROOT` is a plugin-config token.** It is substituted in hook commands and
  `settings.json`, not exported into the environment of `Bash` tool calls. Use the base
  directory instead.
- **Echo any path you compute in Bash.** Shell state does not survive between tool calls, so a
  value that is only assigned (`SCRATCH=$(mktemp -d)`) cannot be read back later. Print it.

When a needed file is genuinely missing, stop and tell the user — never improvise a path.

## SKILL.md conventions

These apply to every `SKILL.md` under `plugins/<plugin-name>/skills/<skill-name>/`.

Before writing or editing any `SKILL.md`, read the `writing-skills` rubric at
[`plugins/instruction-writing/skills/writing-skills/SKILL.md`](../plugins/instruction-writing/skills/writing-skills/SKILL.md) —
invocation choice, description writing, information hierarchy, and pruning.

### Naming

Skill directory name and the `name:` field in frontmatter must match, and both should be **domain-prefixed**: `<plugin-domain>-<topic>`. The qualified reference (`<plugin>:<skill>`) then carries the domain in both segments.

- ✅ `keep-awake-linux:keep-awake-inspect`, `html-visualization:html-visualize-ask`, `project-review:project-review-docs`
- ❌ `keep-awake-linux:inspect` — bare verb, no domain

Within a plugin, sibling skills share the same domain prefix so they sort and read as a family.

Two exceptions allow a name that isn't domain-prefixed:

- A "main" skill may take the plugin's own name (e.g. `project-explore:project-explore`, `github-releases:github-releases`).
- When a plugin's skills are each named for a distinct, self-sufficient concept that does the triggering on its own — a leading word, not a generic operation like `inspect` — the bare name is preferred, because a shared prefix would only dilute it (e.g. `challenge:grill`, `challenge:kiss`, `challenge:are-you-sure`).

Either way, the qualified `<plugin>:<skill>` reference still carries the domain in its plugin segment.

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

This is the default schema — nearly every skill in the marketplace uses it. Examples: `tasks-work`, `project-explore`, `html-visualize-demo`, the `project-execute` exec skills (`project-exec-testing`, `project-exec-releasing`, `project-exec-monitoring`), `project-explain`, the `project-review-*` lenses, `challenge:grill`, `challenge:kiss`, `github-releases`, `keep-awake-inspect`, and `test-tests`.

**Schema B — model-discoverable:**

```yaml
---
name: <skill-name>
description: "<one-line summary>"
when_to_use: "Use when … Triggers on '…', '…'. Does not apply to …"
---
```

Use only for skills that must stay reachable through the `Skill` tool — in practice, a skill that sibling skills or agents load by name while it also stays user-invocable. Example: `tasks:tasks`, loaded by `tasks-work`, `tasks-create`, and the `implementer`/`verifier` agents. `when_to_use` carries the trigger guidance — write positive triggers, exclusions, and (where it helps) the argument shape.

Do not reach for Schema B just because a skill *could* be auto-invoked. A 60-day audit of local transcripts found the model almost never picked these skills up from context (0 invocations in the trailing two weeks) while users reached them by slash command, so the auto-invokable ones were converted to Schema A.

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
long value is truncated. Enumerating the accepted values there also duplicates a list the body
already owns, and goes stale independently of it; name the shape, not the options.

State what happens when the argument is empty, since a user-invoked skill is frequently
invoked bare. Either default it ("with no argument, review the whole test suite") or ask.
