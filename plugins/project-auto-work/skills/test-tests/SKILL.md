---
name: test-tests
description: "Empirical test-suite strength audit — proves whether the tests detect injected bugs (mutation kill rate), stay quiet on non-bugs, are flake-free under reruns/shuffle/delays, run fast, and are really isolated from external services. It measures for itself which lines the tests execute, so no coverage report is needed. Reports findings and proposals; never keeps an edit."
user-invocable: true
disable-model-invocation: true
argument-hint: "[low|medium|high|ultra] [html-viz] [path]"
---

Empirical test-suite strength audit. Launch the audit workflow — do **not** probe the
suite inline. The workflow returns a structured report; relay it and save it to a file.

The audit temporarily mutates production code to check that tests fail, inside its own
git worktrees when the suite can run there, or in the live tree under a backup/restore
protocol when it cannot — either way every edit is reverted and integrity-checked.
Nothing is ever committed, no test is written, nothing is installed.

## Run the workflow

1. Parse `$ARGUMENTS` as `[low|medium|high|ultra] [html-viz] [path]`. All optional, and
   either leading token stands without the other. A `low` | `medium` | `high` | `ultra`
   token is the **level** and an `html-viz` token puts the open decisions on a browser
   form in step 6; take both from the front of the argument, in either order. Everything
   left is the target path (default: the repo root — resolve a free-form description to
   a directory or fall back to the root).

   If no level token is given, ask with `AskUserQuestion` (header "Level"):
   - `low` — the highest-churn components, a few mutants each. Quick signal.
   - `medium` (recommended) — all components (capped), plus no-op and delay probes and
     the two audit-wide probes: unit isolation, and coverage-truth where the repository
     has a coverage command at all. The standard audit.
   - `high` — the deepest dials, plus an adversarial pass that refutes equivalent
     mutants. The trustworthy-numbers audit.

   `ultra` is accepted so one depth token means the same thing across the audit
   workflows, but this audit has no rung above `high` — its cost is the suite's own
   runtime, not a refutation pass — so `ultra` runs the `high` dials. The exact
   per-level dials live in the workflow's `DIALS` table.

   At every level, one rerun uses the runner's native order-shuffle flag (fixed
   seed) when one exists.

   Wall time is dominated by the suite's own speed in every tier, and a weak suite
   costs more of it than a strong one: every mutant that survives earns one extra
   run, the reachability probe that makes it readable.

2. `SKILL_DIR` is the **base directory for this skill**, given at the top of this file when
   the skill loads. It is absolute and install-correct — build every path below from it.

3. Check the prerequisite, snapshot the target tree so integrity is verifiable afterwards,
   and create a per-run scratch dir. Echo the scratch path: shell state does not survive
   between commands, so a value you only assign is gone by the time step 4 needs it.

   ```bash
   command -v python3 >/dev/null || { echo "python3 missing — stop and tell the user"; return 2>/dev/null || exit 1; }
   SCRATCH=$(mktemp -d /tmp/test-tests-XXXXXX) && echo "$SCRATCH" || echo "mktemp failed — stop; do not launch without a scratch dir"
   git -C "<path>" status --porcelain > "$SCRATCH/pre-status.txt"
   git -C "<path>" diff > "$SCRATCH/pre-diff.patch"
   ( cd "<path>" && git ls-files --others --exclude-standard -z | xargs -0 -r md5sum ) > "$SCRATCH/pre-untracked.md5"
   ```

   The untracked hashes matter: `git diff` is blind to untracked-file content, and a
   mutation left in an untracked production file would otherwise pass the check.

4. Invoke the **Workflow** tool:
   - `scriptPath`: `<SKILL_DIR>/workflows/test-tests.js`
   - `args`: `{ "repoRoot": "<path>", "scriptsDir": "<SKILL_DIR>/scripts", "level": "<level>", "scratchDir": "<the absolute path printed above>" }`

   The workflow measures six axes — sensitivity (mutants must be killed),
   specificity (no-op edits must not break tests), reliability (reruns, shuffle,
   delay injection), speed, isolation (unit tests must survive losing their external
   environment), auditability (what the repository lets an audit verify) — and
   aborts *with a remediation report* rather than guessing. It aborts when:

   - the suite is too slow to finish inside the cap
   - the suite is red
   - no component could be grouped for audit
   - no audited component produced a mutant, leaving nothing scoreable

   A missing coverage report is **not** on that list — see
   [Reachability is measured, not read](#reachability-is-measured-not-read).

   The report then tells the user exactly how to make the repo auditable.

   The audit also stops taking on new components once findings reach the workflow's
   `FINDINGS_CAP`. Components it never mutated land in `not_checked`, and the headline
   says the run was capped — `kill_rate` is then a rate over the components that ran.

5. **Verify tree integrity** — after the workflow returns *or* fails:

   ```bash
   git -C "<path>" status --porcelain > "$SCRATCH/post-status.txt"
   git -C "<path>" diff > "$SCRATCH/post-diff.patch"
   ( cd "<path>" && git ls-files --others --exclude-standard -z | xargs -0 -r md5sum ) > "$SCRATCH/post-untracked.md5"
   diff "$SCRATCH/pre-status.txt" "$SCRATCH/post-status.txt" \
     && cmp -s "$SCRATCH/pre-diff.patch" "$SCRATCH/post-diff.patch" \
     && diff "$SCRATCH/pre-untracked.md5" "$SCRATCH/post-untracked.md5"
   git -C "<path>" worktree list   # audit worktrees live under $SCRATCH
   ```

   On any tracked/untracked drift: inspect it, restore leftover mutations from the
   worker backups under `$SCRATCH/backup-*/` (live-tree mode — each backup file's
   path relative to its `backup-N/` dir is its repo-relative path; copy it back,
   never `git checkout`), and tell the user exactly what was found and restored.
   If `git worktree list` still shows entries under `$SCRATCH`, remove each with
   `git -C "<path>" worktree remove --force <wt>` and finish with
   `git -C "<path>" worktree prune`. Never leave any of this unreported.

6. Relay the report. The workflow returns
   `{ report: { verdict, headline, scores, findings[], proposals[], … }, raw, … }` —
   surface `.report` in full, and do not re-derive or soften it. Also save it as
   markdown to `$SCRATCH/test-tests-report.md` (outside the repo) and state that
   path — the user may grill it or act on it in a later session. For a "did you
   really check X?" follow-up, **re-run the skill**; never answer from the report
   alone.

   Each proposal is tagged `settled` or `open`. Follow
   `<base directory for this skill>/../../references/decision-split.md` — it defines
   both words and branches on `html-viz`. Done when every open item has been put to the
   user and the settled batch has been named. The plugin-root layout applies, so `../..`
   is correct here.

If `python3` is missing or the workflow cannot launch, do not improvise an inline
audit — report which prerequisite is missing and stop. If the workflow returns an
object with `error` and no `report` (bad arguments, or the baseline agent died),
relay the error verbatim, state that the audit did not run, and do not improvise
findings — still run the step-5 integrity check. When the error carries `got`, the
run never started and `got.keys` lists the arguments that actually arrived — surface
it, since that is what shows a misspelled key.

## Reachability is measured, not read

A mutant has two outcomes and only one of them explains itself. A **killed** mutant proves
two things at once: a test executes that line, and it asserts something the mutation breaks.
A **surviving** mutant proves neither — the line may be code no test runs, or the edit may
change nothing observable.

So the audit measures the difference rather than reading it out of a coverage report. For
each survivor, and only for a survivor, it puts the most lethal one-line edit the language
allows at the same site — a throw carrying the marker `TT-REACH` — and runs the slice once
more:

| The throw | What it proves | How the report reads it |
|---|---|---|
| a test fails naming `TT-REACH` | the line executes | a blind spot: the tests run this code and pin none of the behavior the mutation changed |
| the slice stays green | no test executes the line | untested code — the fix is a new test, never a stronger one |
| it will not compile, or a broad `catch` could swallow it | nothing | `inconclusive`, and it stays in the pessimistic half of the score |

A killed mutant costs no probe: the kill already proved its line runs. The extra runs
therefore scale with the number of survivors — which is to say, with how weak the suite
turns out to be.

`kill_rate` is then a rate over sites the tests demonstrably reach. Sites proven unreached
leave the ratio and become findings of their own kind, because "write a test" and "fix a
blind test" are opposite repairs. Inconclusive sites stay in the denominator: the audit
could not prove them absent, and the pessimistic reading is the honest one.

A throw needs no instrumentation, no coverage tooling and no install, and it behaves the
same in any language. That is what keeps the audit portable now that nothing is read on
trust.

## The coverage report is an optional input

Where the repository documents a command that emits a coverage summary as JSON on stdout,
conforming to [`references/coverage-summary-schema.md`](references/coverage-summary-schema.md)
(a `files` array of repo-relative path + covered/uncovered line ranges), the workflow runs
it, validates it with `scripts/validate-coverage-summary.py`, and spends it on two things:
ranking candidate mutation sites, so more of the run lands on code the tests already reach,
and `untested_churn`. It is never a filter — a line the report calls uncovered is still a
legal target, and the throw probe settles the question either way.

No such command is a normal outcome, not a fault. The audit loses the ranking hint and the
coverage-truth probe, says so in `not_checked`, and runs to a full report. It never parses
coverage formats: all format-specific work stays in the repository.

Where a command does exist it is the one input the audit would otherwise take on trust, so
from `medium` up it gets probed: a few mutants land on lines the summary calls *uncovered*,
chosen where the summary is most likely wrong — code driven by subprocess or real-service
tests, uncovered ranges inside otherwise-covered functions. A mutant killed there proves the
command under-reports.

## The unit/integration split comes from the repository too

A unit test needs no database, socket, or other external process. So the audit runs the
unit slice once with that environment denied, and each test that fails only because the
environment is gone is an integration test wearing a unit-test label — CI time spent under
a name that promises speed.

Which tests are unit tests is the repository's own claim: the baseline discovers the
declaration from the same sources as the test command, then greps the production code for
the environment variables it actually reads that name a host, URL, port, DSN or credential.
The denial recipe is built from that list and nothing else. Environment is the whole
mechanism, and that is what makes the probe portable — any OS, no privileges, nothing
installed.

The probe reports **not run**, with the reason, in two cases: the repo declares no split,
or its production code reads no such variable and there is therefore nothing to take away.
The second matters more than it looks. A repo that reaches the outside world through
hardcoded hosts or in-process fakes would pass a denied run while nothing was denied, and
an empty failure list would read as proven isolation — so it lands in `not_checked`
instead. Both cases also raise an `auditability` finding, and neither is guessed at from
file names.

## Verdicts

The verdict (`strong` | `adequate` | `weak` | `untrustworthy` | `not-auditable` — the
last is an abort report with remediation proposals) and its scoring thresholds are
computed by the workflow; relay them as returned. Below `high`, a surviving mutant the
probe proved *reachable* is labeled `candidate: true` — a possible equivalent mutant,
presented with its diff, never as proof. A survivor proven *unreached* is never a candidate
at any level: nothing there was argued, it was measured. Delay-injection findings are always
candidates: a test failing under an added delay may be brittle or may encode a legitimate
latency contract — the user decides.

Two caps sit outside that scoring, and each puts `strong` out of reach:

- **Reachability** — where a third or more of the *mutation sites* are run by no test,
  `kill_rate` is a rate over the little the tests execute. The headline must give the share
  no test reaches.
- **Coverage truth** — a killed coverage-truth mutant means the repository's coverage
  command under-reports, so any site it ranked was ranked from data proven incomplete. The
  headline must say the coverage source is unreliable. A *surviving* coverage-truth mutant
  restates what the summary already said and is never reported as a finding.

The report also carries `untested_churn`: the repository's own coverage claim joined with
git churn and ranked by churn × uncovered lines. The audit does not verify it and builds no
finding on it — it costs no suite run, carries no severity, changes no score, and is
churn-weighted rather than risk-ranked. It is empty where the repo has no coverage command.
Relay it as the unverified pointer list it is; the proven-unreached sites among the findings
are its audited counterpart.

## Not covered

Reading-based judgment about tests — whether a mock hides the failure path nobody tests,
whether an expensive test covers a risk a fast one cannot, whether the test code is
maintainable → `project-review:project-review-codebase`, which reviews test code across
its consistency, structure and architecture dimensions. Writing or fixing tests → out of
scope by design; the report's proposals name the missing tests, the user decides what to do.
