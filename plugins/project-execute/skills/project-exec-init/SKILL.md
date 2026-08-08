---
name: project-exec-init
description: "Set up the project's agent-facing doc set — write the steering files plus the topic docs the repo has earned."
user-invocable: true
disable-model-invocation: true
---

**Set up this project's agent-facing docs.** Write the canonical files the project is missing, drafted from what the repo already does.

Write only files that are absent. A file that already exists stays exactly as it is, whatever it contains — step 4 reports it instead.

## 1. Load the standard

Invoke `instruction-writing:writing-project-docs` through the `Skill` tool and follow it. It owns the canonical file set, each file's *Inside* / *Not inside* contract, the worked examples, and the authoring rules — this skill decides *which* files to write, that skill decides how each one is written.

`project-execute` declares `instruction-writing` as a dependency, so a skill that fails to load means a broken install: stop and say so.

## 2. Scan the repo

Read what the project already carries and record two lists.

**Present** — which of `README.md`, `AGENTS.md`, `CLAUDE.md` exist, and every file under `docs/`. Read each one against its *Inside* / *Not inside* contract in the standard and note what breaches it. Step 3 routes to these; step 4 reports the breaches.

**Earned** — which canonical topics the repo has real local guidance for. A topic is *earned* only where the repo holds the evidence below; a topic doc for anything else would be hollow, which the standard rules out.

| Topic doc | Earned by |
|---|---|
| `OVERVIEW.md` | any repo past a trivial layout — earned by default |
| `CODING.md` | lint/format/build config, a task runner, or a convention visible across the source |
| `TESTING.md` | a test suite, a test task, or a CI test job |
| `RELEASING.md` | a release workflow, a publish or tag script, or a version manifest the project bumps |
| `CHANGE-WORKFLOW.md` | a PR template, commit hooks, branch protection, or a stated commit/branch convention |
| `REVIEWING.md` | a review rule local to this repo that a generic reviewer could not guess |
| `RUNNING.md` | an entrypoint a human starts by hand — CLI, server, app |
| `MONITORING.md` | logs, metrics, traces, or usage data the project produces and someone reads |

Keep the evidence you found for each earned topic. It is the material step 3 writes from, and the reason step 4 gives for every topic left out.

## 3. Write what is missing

- `README.md`, `AGENTS.md`, `CLAUDE.md` — always, when absent. They are the required set.
- `docs/<TOPIC>.md` — only for an earned topic that has no file yet.

**Ground every line in this repo.** Where the repo settles a question, write what it settles; where it does not, drop the point.

`AGENTS.md` routes the whole set — the docs you just wrote and the ones already present.

## 4. Report

- Every file created, one line each on what it carries.
- Every topic left out, naming the evidence that was absent.
- Every existing file whose content breaches its contract in the standard — the file and what is off about it. These were left untouched: say so, and name `project-review:project-review-docs` for the full audit — a separate plugin, so mention it may need installing — and `instruction-writing:writing-project-docs` for the fix.
