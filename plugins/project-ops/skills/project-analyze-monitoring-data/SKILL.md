---
name: project-analyze-monitoring-data
description: "Analyze the project's recent monitoring data — discovers and loads any installed monitoring skills, follows docs/MONITORING.md, then reviews the data and reports findings."
user-invocable: true
disable-model-invocation: true
---

Analyze the project's monitoring data. Do not assume anything about how this project is monitored — derive everything from the two sources below.

## 1. Gather guidance

- Look for installed monitoring skills and load any that apply. Treat them as the source of truth for how observability data is queried here.
- Read `docs/MONITORING.md` and any MONITORING routing in `AGENTS.md` for the repo-specific observability surfaces, dashboards, and evidence paths.

## 2. If there is no guidance

If **no** monitoring skill applies **and** `docs/MONITORING.md` does not exist (or has no real monitoring guidance), do not guess the monitoring stack or invent data sources.

Instead, stop and tell the user that there is no monitoring guidance for this project, and that they should create `docs/MONITORING.md` describing the observability surfaces and how to query them (the `project-docs` plugin can scaffold it). Ask whether they want to proceed anyway with whatever you can infer, but do not start querying until they confirm.

## 3. Analyze the data

Optional argument (advisory only — time window or scope hint; defaults to the last 24 hours):

$ARGUMENTS

- Query and analyze the monitoring data exactly as the skills and `docs/MONITORING.md` define — no assumed metrics, tools, or data sources.
- If several monitoring sources or dashboards are defined and it is not clear which the user wants analyzed, ask the user which to cover before querying.
- If an argument is given, use it to resolve that ambiguity or to set the time window.
- Keep this analysis read-only — do not change configuration or acknowledge/silence alerts.

## 4. Report

Report a health summary, the findings ranked by severity with supporting evidence, and concrete follow-ups where warranted.
