# Review Process (maintainer reference)

What `project-review-docs` does, stage by stage, and where each bar the agents apply is
inlined. **Nothing loads this file.** The workflow carries its own prompts, so every bar
described here has an authoritative home in code — change the code, and keep this in step.

The standard the review measures against belongs to `instruction-writing`:
`writing-project-docs/references/project-setup.md` (the canonical doc set and each file's
Inside / Not-inside ownership), `writing-project-docs/references/project-doc-guidelines.md`
(the six named authoring rules and the doc-set failure modes), the worked `examples/`, and
`references/writing-hygiene.md` at that plugin's root (single source of truth, cache,
relevance, sediment, no-ops, negation — shared with `writing-skills`, which is why the
workflow reaches it with `../..`). `manifest.py --setup-md` parses the setup file into a
per-file contract; the read-review agents read the guidelines and the hygiene rules.

## Why it is built this way

A green manifest — links resolve, nothing missing — is **necessary, not sufficient**. Only
reading each doc against the standard and its ownership contract catches the
accurate-but-misplaced section and the doc an agent cannot work from, and only past sessions
show whether a route is followed. Each stage exists because the ones before it cannot see
that class of defect.

Cost decides the shape as much as coverage does. Every agent turn re-sends the agent's whole
context, so an agent that gathers evidence one tool call at a time pays for everything it has
read once per call. An earlier build gave each doc its own opus agent with a brief to verify
every claim against the code: on a 45-doc repo those agents averaged 59 turns, and read-review
alone cost about $100 for a doc set of about 120k tokens. So every agent now reads a fixed file
list in one parallel batch and then judges, and a level buys model, effort, and history sample
size, never more turns.

The price is one class of defect. No stage opens the code, so a doc that has drifted from the
code without contradicting another doc goes uncaught, and the report says so. Checking claims
against the code needs either an agent grepping claim by claim, which is the cost above, or a
script deciding what counts as a claim, which is guessing.

## Stages

`workflows/review-docs.js`, in order. `meta.phases` names them; this is what they do.

1. **Manifest** — `scripts/manifest.py` emits the deterministic facts: files, present and
   missing canonical docs, line/word/byte counts, link and anchor resolution, reachability
   from `AGENTS.md`, the `CLAUDE.md` invariant, hollow docs, location violations, injected
   tool-blocks, and the route list. Scripts do facts; agents do judgment — nothing here
   judges belonging or accuracy.
2. **Read-review** — the docs are ordered (the steering files, then the use-case docs, then
   the rest by path) and packed into batches of up to `BATCH_BYTES` of doc text, so a 45-doc
   repo takes four or five agents. Each agent's first action is one parallel batch of Read
   calls over the standard and its docs, and it makes no other tool call. Every file gets a
   section in the prompt that sets the seat it is judged from:
   - *Use case*: a canonical topic doc that exists is judged as by an agent arriving to do
     that work rather than to audit a file — can it actually code from `CODING.md`? A use
     case whose doc is absent is not reviewed, because the standard makes topic docs
     optional and never reports one missing.
   - *The rest*: `README.md` and `CONTRIBUTING.md` serve humans, `AGENTS.md` is the router
     itself and is judged for trigger edges, and a non-standard doc is judged for
     canonical-topic placement. `CLAUDE.md` is excluded — the manifest checks its invariant
     mechanically and synthesis raises it.

   Every file is asked *belongs here?* of each unit of content against its ownership
   contract, and accurate-but-misplaced content is a finding under *Ownership*. Accuracy is
   judged from the text: docs that contradict each other or themselves, and the unresolved
   links the manifest lists. Each agent returns the files it reviewed, and a file no agent
   lists is named in the log and the report.

   Where the repo has a `docs/DOCUMENTING.md`, every batch agent also reads it and is told to
   drop gap findings its recorded decisions already settle. The suppression is scoped to gaps
   by name: a false claim, a stale command, a dead link, or out-of-boundary content stays at
   full severity whatever the decisions say, and a decision that contradicts the repo is
   itself a finding. Repos without the file are told nothing about decisions.
3. **History** — the docs were used or they were not, and past sessions say which.
   `scripts/history.py` extracts the user messages of this repo's transcripts; a small model
   labels each with a use case; the script then filters, stratifies, and projects into one
   evidence file per use case; a single judge reads those files and decides, per use case,
   whether the doc was opened, and opened before the first action of that kind. Details below.
4. **Synthesis** — merge and dedupe, reconcile across files (sibling contradictions; a missing
   canonical doc whose content lives under another name), raise the mechanical facts no reading
   agent covered, then verdict and report. It re-reads `docs/DOCUMENTING.md` where one exists and
   drops any surviving finding those decisions settle, naming in `cross_file_notes` what it
   dropped and which decision covered it — so a suppression is visible rather than silent.

## Where the bars live

Change them at the authoritative site. This table is the index, not the source.

| Bar | Authoritative site |
|---|---|
| The six authoring rules, the doc-set failure modes | `instruction-writing:writing-project-docs`, loaded by each read-review agent |
| Single source of truth, cache, relevance, sediment, no-ops, negation | `references/writing-hygiene.md` at the `instruction-writing` plugin root, loaded by each read-review agent |
| Per-file ownership contract | `project-setup.md`, parsed by `manifest.py`, injected per agent |
| Severity (`blocker` / `major` / `minor`) and the escalation rule | `batchPrompt` in `review-docs.js` |
| What a batch agent reads, and how docs are packed | `batchPrompt`, `orderTargets`, `packBatches`, and `BATCH_BYTES` in `review-docs.js` |
| Use case → doc, and the classifier's label vocabulary | `USE_CASES` in `review-docs.js` and `USE_CASE_DOCS` in `history.py` — two copies, because workflow scripts cannot import; pinned by `test-history.sh` |
| What each level buys | `LEVEL_CONFIG` in `review-docs.js` |
| History finding floor | `MIN_SEGMENTS_FOR_FINDING` in `review-docs.js` |
| What a repo's recorded doc decisions may suppress | the decisions blocks in `batchPrompt` and in the synthesis prompt, `review-docs.js`; the *Recorded decisions* bullet of `docs/DOCUMENTING.md` in `project-setup.md` states the contract |
| Overall verdict (`accurate` / `minor gaps` / `significant gaps` / `misleading`) | `REPORT_SCHEMA` and the synthesis prompt |

## The history stage

The only stage that measures use rather than inferring it, and the only one that can be
wrong in a way the others cannot: it is a **lagging indicator**.

The filter is on the **route, not the doc**. What the stage concludes — routed / late /
missed — is a claim about whether a file was *opened*, and that behaviour was driven by the
`AGENTS.md` route, which is always in the agent's context, never by the doc's contents,
which the agent had not seen. So a segment counts only when the route line for that doc
reads exactly as it does today (whitespace-normalized; there is no threshold). Doc churn is
deliberately ignored: filtering on it would discard evidence for a change that could not
have affected the behaviour being measured.

Getting this backwards is not a tuning error, it is a correctness error. An earlier build
filtered on doc churn, which let sessions from before a route rewrite through — and then
judged that old behaviour against the *new* route wording. Skips that happened under an
advisory route were attributed to the agent because the route reads as an obligation today.
Rewrite your routes and history goes quiet until new sessions accumulate; that silence is
the honest answer.

Silence is not the same as deletion. Segments whose route has since been reworded are
summarised per old wording — how many did the work, how many opened the doc — and reported
as **superseded-route evidence**. It never touches a severity, an attribution, or the
verdict, because it says nothing about the text that exists now. It is reported because it
is the thing that shows whether a rewrite was warranted: "under `Load docs/CODING.md for
step-by-step guidance`, 25 of 25 segments did the work and 4 opened the doc" is the argument
for the obligation wording that replaced it. Capped at `HISTORICAL_CAP` per use case, and
the coverage record says how many were left unexamined rather than truncating silently.

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

- **Read-review agents** read their listed files and nothing else. They read the live tree,
  so they audit uncommitted doc edits rather than `HEAD`.
- **History agents** read transcripts under `~/.claude/projects` and write only into the
  scratch dir. They never touch the repository.
- **The scratch dir** is minted per run by `SKILL.md` and holds the history extracts, labels,
  and evidence. Filenames are deterministic, so two runs sharing a directory would read each
  other's labels.
