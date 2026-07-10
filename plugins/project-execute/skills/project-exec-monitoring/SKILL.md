---
name: project-exec-monitoring
description: "Analyze the project's monitoring data the way the project itself defines it."
user-invocable: true
disable-model-invocation: true
argument-hint: "[what-to-analyze]"
---

**Analyze the monitoring data.** Scope: $ARGUMENTS

Follow the project's own monitoring flow exactly. Do not invent metrics, tools, or data sources — if the project defines no monitoring flow, do nothing and report that monitoring is not configured for this project.

If the project offers more than one thing to analyze and the scope above does not settle which, ask the user — do not assume.

Report faithfully.
