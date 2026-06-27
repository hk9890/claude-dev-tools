---
name: project-analyze-monitoring
description: "Analyze the project's recent monitoring data using the project's own docs and skills, then report findings."
user-invocable: true
disable-model-invocation: true
---

This is a thin entry point. The real procedure is not in this skill — it lives in the project's own docs. Do not assume how this project is monitored; derive everything from the source of truth.

Treat as the source of truth, in order: `docs/MONITORING.md`, the MONITORING routing in `AGENTS.md`, and any installed monitoring skill. Follow exactly what they define — no assumed metrics, tools, or data sources.

If there is no such guidance (no `docs/MONITORING.md` with real monitoring guidance and no applicable monitoring skill), stop. Tell the user to add `docs/MONITORING.md` first — do not guess the stack or invent data sources.

Keep this analysis read-only — do not change configuration or acknowledge/silence alerts.

Report faithfully.
