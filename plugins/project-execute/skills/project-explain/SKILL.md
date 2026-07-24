---
name: project-explain
description: "Explain how this project handles a given topic, as a tight digest drawn from the project's own docs."
user-invocable: true
disable-model-invocation: true
argument-hint: "[topic]"
---

**Explain how this project handles a topic.** Topic: $ARGUMENTS

With no topic, list the topics this project's docs actually cover and ask which one to explain. If the topic is ambiguous or could mean several things, ask the user which they mean before answering — do not assume.

Read the project's own documentation for that topic and explain, in ~200 words, how *this* project handles it — a tight digest a teammate could read in a minute, not a copy of the doc. Ground every statement in what the project actually documents; do not invent conventions, steps, or rationale the project does not state.

If the project has no documentation covering the topic, do not guess: say it is not documented here, then offer to explain from the code instead or ask the user to narrow the topic.

This skill is read-only — it explains, it never changes anything.
