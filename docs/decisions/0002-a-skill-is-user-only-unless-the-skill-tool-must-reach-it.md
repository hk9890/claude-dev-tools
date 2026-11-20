# 0002: A skill is user-only unless the Skill tool must reach it

Claude Code loads the listing entry of each model-invocable skill into every session. A user-only
skill (`disable-model-invocation: true`) has no entry: only its slash command starts it.

Rejected: a model-invocable skill that a request in prose only could reach, because its entry loads
in every session, and each such skill had few Skill tool calls in the
[session reviews](../MONITORING.md#run-a-review) (`usage.md`, Model-invoked column) before it
became user-only.
