# Testing a Plugin

How to validate and manually test plugins in this marketplace.

## Run plugins locally with `scripts/claude-dev`

`scripts/claude-dev` launches Claude Code with all plugins in `plugins/` loaded via `--plugin-dir`. It lets you test plugins exactly as an end user would, without installing them.

```bash
./scripts/claude-dev
```

All skills, commands, and agents from every plugin in this repo are available in the session.

## Structural validation — `plugin-dev:plugin-validator`

The `plugin-dev:plugin-validator` agent validates plugin structure automatically. Ask it to validate a plugin after creating or modifying components:

```
Validate the plugin at plugins/my-plugin
```

It checks:
- `plugin.json` manifest (required fields, format)
- Command, agent, and skill frontmatter
- Hook schema and script references
- File organisation and naming conventions

Use this before publishing or after any structural changes.

## Skill quality review — `plugin-dev:skill-reviewer`

The `plugin-dev:skill-reviewer` agent reviews `SKILL.md` files for trigger description quality, progressive disclosure, and content organisation:

```
Review the skill at plugins/my-plugin/skills/my-skill/SKILL.md
```

Use this after writing or revising a skill to catch weak trigger phrases, over-long bodies, or missing references.

## Manual smoke testing

After running `./scripts/claude-dev`, exercise the plugin's key paths:

1. Invoke each skill by describing the use case it targets (not by name) — verify it triggers correctly.
2. Run each slash command and check output.
3. If the plugin has hooks, perform the triggering action and confirm the hook fires.
4. Test edge cases: missing arguments, unexpected input, empty state.

For skills with workflow routing, trace at least one full workflow end-to-end through any referenced documents.
