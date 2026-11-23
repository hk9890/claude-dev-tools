---
name: project-exec-init
description: "Set up the project's agent-facing doc set: write the steering files plus the topic docs the repo has earned, or set up its private layout for a repo you cannot commit to."
user-invocable: true
disable-model-invocation: true
argument-hint: "[private [write]]"
---

**Set up this project's agent-facing docs.** Write the canonical files the project is missing, drafted from what the repo already does.

Write only files that are absent. A file that already exists stays exactly as it is, whatever it contains — step 4 reports it instead. The one exception is the route lines that private mode adds to `<private>/AGENTS.md`.

**Mode** — from `$ARGUMENTS`:

- With no argument: the repository's own doc set. Run steps 1–4.
- `private`: the setup of the standard's private layout alone, for a repository the user cannot commit to. Run [Private setup](#private-setup) and stop: write no doc.
- `private write`: the private setup, then steps 1–4 in [private mode](#private-mode), which write the doc set into the private folder.
- Any other argument: name these three forms, and stop.

## 1. Load the standard

Call the Skill tool with `instruction-writing:writing-project-docs`, even where it loaded earlier in this session, and follow it. It owns the canonical file set, each file's *Inside* / *Not inside* contract, the worked examples, and the authoring rules — this skill decides *which* files to write, that skill decides how each one is written.

`project-execute` declares `instruction-writing` as a dependency, so a skill that fails to load means a broken install: stop and say so.

## 2. Scan the repo

Read what the project already carries and record two lists.

**Present** — which of `README.md`, `AGENTS.md`, `CLAUDE.md` exist, and every file under `docs/`. Read each one against its *Inside* / *Not inside* contract in the standard and note what breaches it for step 4. Also note whether `docs/decisions/` holds a record, and any folder of decision records in another format (a MADR or Nygard ADR folder, say): steps 3 and 4 read that note, and the files of that other-format folder take part in no contract check.

**Earned** — which canonical topics the repo has real local guidance for. A topic is *earned* only where the repo holds the evidence below; a topic doc for anything else would be hollow, which the standard rules out.

| Topic doc | Earned by |
|---|---|
| `OVERVIEW.md` | any repo past a trivial layout — earned by default |
| `CODING.md` | a build or code-generation config or task, or a mechanism every change of a kind must use — a registration step, a layer boundary |
| `DOCUMENTING.md` | a docs lint or link gate, a doc tree beyond `docs/*.md`, or a stated doc convention |
| `TESTING.md` | a test suite, a test task, a lint or format gate, or a CI job that runs one |
| `RELEASING.md` | a release workflow, a publish or tag script, or a version manifest the project bumps |
| `CHANGE-WORKFLOW.md` | a PR template, commit hooks, branch protection, or a stated commit/branch convention |
| `REVIEWING.md` | a review rule or a source-wide convention — comments, naming, error handling — where no tool checks it and a generic reviewer could not guess it |
| `RUNNING.md` | an entrypoint a human starts by hand — CLI, server, app |
| `MONITORING.md` | logs, metrics, traces, or usage data the project produces and someone reads |
| `decisions/` | a decision the repo states together with its reason — in a code comment or a `git log` message body, or a PR description `gh` can read — that meets the standard's `docs/decisions/` contract |

Where the repo has a git remote, run `gh pr list --state all --limit 1` before you read PR descriptions. Where `gh` is not installed, or this or a later `gh` read fails, take your evidence from the other sources and keep that reason, or gh's error, for step 4.

Keep the evidence you found for each earned topic. It is the material step 3 writes from, and the reason step 4 gives for every topic left out.

## 3. Write what is missing

- `README.md`, `AGENTS.md`, `CLAUDE.md` — always, when absent. They are the required set.
- `docs/<TOPIC>.md` — only for an earned topic that has no file yet.
- `docs/decisions/NNNN-slug.md` — one per decision the evidence states, only where step 2 found no record in `docs/decisions/` and no folder of records in another format, numbered by the standard's lifecycle rule.

**Ground every line in this repo.** Where the repo settles a question, write what it settles; where it does not, drop the point.

A new `AGENTS.md` routes the whole set — the docs you just wrote and the ones already present.

## 4. Report

- Every file created, one line each on what it carries.
- Every topic left out, naming the evidence that was absent.
- Every decision the evidence earned that step 3 did not write, with the reason: records already in `docs/decisions/`, or the home of records in another format it found.
- Where step 2 kept a `gh` reason: "PR descriptions not read: <the reason>. A decision stated only there is not in this report."
- Every new topic doc or `docs/decisions/` folder an existing `AGENTS.md` does not route, with the `MUST read` route line to add.
- Every existing file whose content breaches its contract in the standard — the file and what is off about it. These were left untouched: say so, and tell the user to run `/project-review:project-review-docs` for the full audit — a separate plugin, so mention it may need installing — and name `instruction-writing:writing-project-docs` for the fix.

## Private setup

Run the setup script from the directory you are in. `<base directory for this skill>` is the line given at the top of this file when the skill loads:

```bash
bash "<base directory for this skill>/scripts/private-setup.sh"
```

Where it exits 2, the checkout has no private folder yet, and the user names one. Ask for the folder name, and suggest one: the folder the user's own instructions name for private or scratch files, else `private-docs`. Use only the name the user confirms or gives, and run the script again with it:

```bash
bash "<base directory for this skill>/scripts/private-setup.sh" <folder>
```

Where it exits non-zero otherwise, relay its `error:` line, or the shell's message where it prints none, and stop. Otherwise relay its lines, and tell the user to start a new session in this checkout, and to approve the external-import dialog where Claude Code shows one: a declined import stays off. Then go on to step 1 for `private write`, or stop.

## Private mode

Private mode changes steps 1–4 in four places. `<private>` is `<git toplevel>/<folder>`: `<git toplevel>` is what `git rev-parse --show-toplevel` prints, and `<folder>` stands on the setup's last line, `folder  <folder>`:

- The standard's *Private layout* section governs where each file goes.
- Step 2 reads the repository's own `AGENTS.md`, `CLAUDE.md` and `docs/` as the base, and `<private>/AGENTS.md` and the files under `<private>/docs/` as **Present**, and its decision-record note reads `<private>/docs/decisions/`. A topic is earned only for what the base lacks.
- Step 3 writes topic docs and decision records into `<private>/docs/` and never `README.md` or `CLAUDE.md`. Add the route of each new doc to `<private>/AGENTS.md`, leave its other lines as they are, and commit the result in the `<private>` repository.
- Step 4 checks routes in `<private>/AGENTS.md` only, and names `/project-review:project-review-docs <private>` for the full audit.
