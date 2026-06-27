# Coding Guide

Implementation guide for contributing to this plugin marketplace.

## Adding a new plugin

1. Create `plugins/<plugin-name>/` with the standard layout (see [OVERVIEW.md](OVERVIEW.md) for the directory tree).
2. Write `.claude-plugin/plugin.json` — required fields: `name`, `version`, `description`, `author`.
3. Register the plugin in `.claude-plugin/marketplace.json` under the `plugins` array with fields: `name`, `source`, `description`, `version`, `author`, `category`, `keywords`.
4. If your plugin has non-obvious conventions not captured in code, create `plugins/<plugin-name>/RULES.md` for plugin-specific rules and design decisions.
5. Add the plugin to the table in `README.md`.
6. Use the `plugin-dev` skill set to scaffold components: commands, skills, agents, hooks, MCP integration. `plugin-dev` ships in an external plugin and must be installed separately — see [TESTING.md](TESTING.md) for install instructions.

## Declaring plugin dependencies

The `plugin.json` `dependencies` field is honored by the Claude Code marketplace harness — when a user installs a plugin that declares dependencies, the harness auto-installs each listed plugin at the same scope as the parent. Semver constraints are supported and enforced. Full behavior is documented at https://code.claude.com/docs/en/plugin-dependencies.

Use the right pattern for each dependency kind:

- **Plugin depends on another plugin** (e.g. a workflow plugin that reuses another plugin's skills): declare the dependency in `plugin.json` under `dependencies`. The harness handles install, scope, and chained enable/disable.
- **Plugin depends on a CLI tool** (e.g. `project-explore` → `taskmgr`, `html-visualization` → `node`): the harness cannot install CLI binaries. Add a runtime check at skill load time (Phase 0) that tests whether the CLI is present and stops with guidance if it is missing. Do not add CLI tools to the `dependencies` field.

## SKILL.md conventions

These apply to every `SKILL.md` under `plugins/<plugin-name>/skills/<skill-name>/`. Plugin-specific RULES.md may add or restrict, but should not contradict.

### Naming

Skill directory name and the `name:` field in frontmatter must match, and both should be **domain-prefixed**: `<plugin-domain>-<topic>`. The qualified reference (`<plugin>:<skill>`) then carries the domain in both segments.

- ✅ `keep-awake-linux:keep-awake-inspect`, `html-visualization:html-visualize-ask`, `project-quality:project-review-docs`
- ❌ `keep-awake-linux:inspect` — bare verb, no domain

Within a plugin, sibling skills share the same domain prefix so they sort and read as a family.

A "main" skill may take the plugin's own name (e.g. `project-explore:project-explore`, `github-releases:github-releases`); this is the only accepted exception.

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

Use for skills that perform a consequential, explicit action and should only run when the user types the slash command. Examples: `tasks-work`, `project-explore`, `html-visualize-demo`, the `project-quality` exec skills (`project-exec-testing`, `project-exec-releasing`, `project-exec-monitoring`), the orchestrated `project-quality:project-review` (a full run spawns many agents), and `project-explain`.

**Schema B — model-discoverable:**

```yaml
---
name: <skill-name>
description: "<one-line summary>"
when_to_use: "Use when … Triggers on '…', '…'. Does not apply to …"
---
```

Use for skills the model should suggest or auto-invoke from context. `when_to_use` carries the trigger guidance — write positive triggers, exclusions, and (where it helps) the argument shape. Examples: the `project-review-*` skills, `github-releases`, `keep-awake-inspect`.

**Reference libraries** are skill folders loaded *by* sibling skills, not invoked directly. They use `user-invocable: false` and omit `when_to_use`. Examples: `html-visualize`.

Do not mix schemas — a skill with both `disable-model-invocation: true` and `when_to_use:` is contradictory.

## Plugin rules files

Rules files live at `plugins/<plugin-name>/RULES.md`. They record facts, constraints, and design decisions that are not derivable from the code — deliberate feature exclusions, chosen approaches, known tradeoffs.

**Before making decisions or changes for a plugin, read its rules file.** Rules override general best-practice suggestions.

Rules files follow the pattern `plugins/<plugin-name>/RULES.md`. Not every plugin has one — only create a file when there is a real decision or constraint to record.

Check `plugins/*/RULES.md` files for plugin-specific design rules.
