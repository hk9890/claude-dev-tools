# Review Process (maintainer reference)

What `project-review-docs` does, stage by stage, and where each bar the agents apply is
inlined. **Nothing loads this file.** The workflow carries its own prompts, so every bar
described here has an authoritative home in code — change the code, and keep this in step.

The standard the review measures against belongs to `instruction-writing:writing-project-docs`:
`references/project-setup.md` (the canonical doc set and each file's Inside / Not-inside
ownership), `references/project-doc-guidelines.md` (the six named authoring rules and the
failure modes), and the worked `examples/`. `manifest.py --setup-md` parses the first into a
per-file contract; the read-review agents load the second.

## Why it is built this way

A green manifest — links resolve, nothing missing — is **necessary, not sufficient**. Only
reading each doc against the repo catches the confident falsehood, only the ownership
contract catches the accurate-but-misplaced section, and only running the docs catches the
stale-but-plausible procedure. Each stage exists because the ones before it cannot see that
class of defect.

## Stages

`workflows/review-docs.js`, in order. `meta.phases` names them; this is what they do.

1. **Manifest** — `scripts/manifest.py` emits the deterministic facts: files, present and
   missing canonical docs, line/word/byte counts, link and anchor resolution, reachability
   from `AGENTS.md`, the `CLAUDE.md` invariant, hollow docs, location violations, injected
   tool-blocks, and the route list. Scripts do facts; agents do judgment — nothing here
   judges belonging or accuracy.
2. **Read-review** — one agent per doc, each carrying only its own ownership contract and
   seeing no sibling, so there is no doc set to satisfice against. For every unit of content
   it asks *true?* and *belongs here?*; accurate-but-misplaced content is a finding under
   *Ownership*. Non-standard docs are judged for canonical-topic placement instead of against
   a boundary. `CLAUDE.md` is excluded here — the manifest checks its invariant mechanically
   and synthesis raises it.
3. **Execution** — the docs are used, not just read. Per `AGENTS.md` route: a driver generates
   a task from the target doc and holds the answer key; a cold, uncoached action agent attempts
   it from `AGENTS.md` in the live tree; the driver grades the trace against the key.
   Attribution to doc / agent / environment is the driver's core judgment — get it wrong and
   the stage either misses real bugs or cries wolf. Tier-C (destructive) tasks are classified
   but never run.
4. **Verify** (`level=ultra` only) — each read-review finding faces an agent told to refute it;
   findings whose cited evidence does not hold up are dropped before synthesis.
5. **Synthesis** — merge and dedupe, reconcile across files (sibling contradictions; a missing
   canonical doc whose content lives under another name), raise the mechanical facts no reading
   agent covered, then verdict and report.

## Where the bars live

Change them at the authoritative site. This table is the index, not the source.

| Bar | Authoritative site |
|---|---|
| The six authoring rules, the failure modes | `instruction-writing:writing-project-docs`, loaded by each read-review agent |
| Per-file ownership contract | `project-setup.md`, parsed by `manifest.py`, injected per agent |
| Severity (`blocker` / `major` / `minor`) and the escalation rule | the common block of `readReviewPrompt` |
| Execution verdicts | `GRADE_SCHEMA` and the stage-3 grader prompt |
| Overall verdict (`accurate` / `minor gaps` / `significant gaps` / `misleading`) | `REPORT_SCHEMA` and the synthesis prompt |

## Read-only contract

The reviewer never edits: every finding carries a recommended fix, and applying it is the
user's separate step. The contract is **not** uniform across stages, deliberately —
`tests/project-review/script-tests/test-readonly-contract.sh` pins the codebase reviewer's
wording and exempts this workflow on those grounds.

- **Read-review agents** run no commands at all. Reading only.
- **The action agent** is a task-doer working in the live tree, so it audits uncommitted doc
  edits rather than `HEAD`. It may not create, modify, or delete any file in the repo, and may
  not change git state; a build or test run is allowed, and the untracked cache output it
  leaves behind is acceptable. Its one writable path is a trace file in the scratch dir,
  outside the repo.
- **The scratch dir** is minted per run by `SKILL.md`. Trace filenames are deterministic and
  the grader treats a trace as primary evidence, so two runs sharing a directory would grade
  each other.
