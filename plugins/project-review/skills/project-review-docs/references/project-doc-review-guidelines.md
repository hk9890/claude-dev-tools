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
2. **Read-review** — two legs, one agent each, none seeing a sibling, so there is no doc set
   to satisfice against.
   - *Per use case*: one agent per canonical topic doc that exists, framed as arriving to do
     that work rather than to audit a file — can it actually code from `CODING.md`? A use
     case whose doc is absent gets no agent, because the standard makes topic docs optional
     and never reports one missing.
   - *Per file*: `README.md` and `CONTRIBUTING.md` serve humans, `AGENTS.md` is the router
     itself, and a non-standard doc is judged for canonical-topic placement. `CLAUDE.md` is
     excluded — the manifest checks its invariant mechanically and synthesis raises it.

   Both legs ask *true?* and *belongs here?* of every unit of content against the file's
   ownership contract; accurate-but-misplaced content is a finding under *Ownership*.
3. **History** — the docs were used or they were not, and past sessions say which.
   `scripts/history.py` extracts the user messages of this repo's transcripts; a small model
   labels each with a use case; the script then filters, stratifies, and projects; a judge
   decides per use case whether the doc was opened, and opened before the first action of
   that kind. Details below.
4. **Execution** (`level=ultra` only) — the synthetic counterpart. Per `AGENTS.md` route: a
   driver generates a task from the target doc and holds the answer key; a cold, uncoached
   action agent attempts it in the live tree; the driver grades the trace against the key.
   Attribution to doc / agent / environment is the driver's core judgment — get it wrong and
   the stage either misses real bugs or cries wolf. Tier-C (destructive) tasks are classified
   but never run. Routes history could not evaluate are probed first.
5. **Synthesis** — merge and dedupe, reconcile across files (sibling contradictions; a missing
   canonical doc whose content lives under another name), raise the mechanical facts no reading
   agent covered, then verdict and report.

## Where the bars live

Change them at the authoritative site. This table is the index, not the source.

| Bar | Authoritative site |
|---|---|
| The six authoring rules, the failure modes | `instruction-writing:writing-project-docs`, loaded by each read-review agent |
| Per-file ownership contract | `project-setup.md`, parsed by `manifest.py`, injected per agent |
| Severity (`blocker` / `major` / `minor`) and the escalation rule | the `commonFrame` block in `review-docs.js` |
| Use case → doc, and the classifier's label vocabulary | `USE_CASES` in `review-docs.js` and `USE_CASE_DOCS` in `history.py` — two copies, because workflow scripts cannot import; pinned by `test-history.sh` |
| What each level buys | `LEVEL_CONFIG` in `review-docs.js` |
| History finding floor | `MIN_SEGMENTS_FOR_FINDING` in `review-docs.js` |
| Execution verdicts | `GRADE_SCHEMA` and the grader prompt |
| Overall verdict (`accurate` / `minor gaps` / `significant gaps` / `misleading`) | `REPORT_SCHEMA` and the synthesis prompt |

## The history stage

The only stage that measures use rather than inferring it, and the only one that can be
wrong in a way the others cannot: it is a **lagging indicator**. A session used the docs as
they were that day, so every segment is filtered against how much its doc has changed since
(`git log --numstat`, summed, over the doc's current length). Summing over-counts a line
edited twice, which errs toward excluding — the safe direction for a filter that only has to
be conservative. Rewrite a doc and its history goes quiet; that is correct.

Two rules keep it honest:

- **Attribution is by route wording.** A doc that gets skipped when its route is advisory is
  a doc finding — the *Advisory route* failure mode, measured instead of guessed. A doc that
  gets skipped when its route is a hard obligation naming the triggering action is an
  observation about the agent, not a defect in the file. `AGENTS.md` is always in context and
  never Read, so its absence from a transcript means nothing; the destination doc is the
  entire signal.
- **No evidence is never a finding.** Below the floor, or with no sessions at all, the stage
  reports coverage and stops. A repository nobody has opened in Claude Code produces an empty
  history stage and a complete audit.

Intent is the one judgment the script never makes. `history.py` extracts user messages and a
model labels them; nothing greps a prompt to guess what it was about, because a filter that
decided intent would quietly decide the findings too.

## Read-only contract

The reviewer never edits: every finding carries a recommended fix, and applying it is the
user's separate step. The contract is **not** uniform across stages, deliberately —
`tests/project-review/script-tests/test-readonly-contract.sh` pins the codebase reviewer's
wording and exempts this workflow on those grounds.

- **Read-review agents** run no commands at all. Reading only.
- **History agents** read transcripts under `~/.claude/projects` and write only into the
  scratch dir. They never touch the repository.
- **The action agent** is a task-doer working in the live tree, so it audits uncommitted doc
  edits rather than `HEAD`. It may not create, modify, or delete any file in the repo, and may
  not change git state; a build or test run is allowed, and the untracked cache output it
  leaves behind is acceptable. Its one writable path is a trace file in the scratch dir,
  outside the repo.
- **The scratch dir** is minted per run by `SKILL.md` and holds both the history extracts and
  the execution traces. Filenames are deterministic and the grader treats a trace as primary
  evidence, so two runs sharing a directory would grade each other.
