# 0002: A skill is user-only unless the Skill tool must reach it

Claude Code loads the listing entry of each model-invocable skill into every session. A user-only
skill (`disable-model-invocation: true`) has no entry: only its slash command starts it. A skill
earns an entry when a skill or agent loads it by name, or the model must start it from context.

Rejected: model invocation only because a request in prose could reach the skill, because each such
skill had few Skill tool calls in the [session reviews](../MONITORING.md#run-a-review)
(`usage.md`, Model-invoked column) before it became user-only.
