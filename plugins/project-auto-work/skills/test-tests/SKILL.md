---
name: test-tests
description: "Empirical test-suite strength audit: proves whether the tests detect injected bugs (mutation kill rate), stay quiet on non-bugs, are flake-free under reruns/shuffle/delays, run fast, and are really isolated from external services. It measures for itself which lines the tests execute, so no coverage report is needed. Reports findings and proposals; never keeps an edit."
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

   A missing coverage report is **not** on that list: the audit measures reachability
   itself rather than reading it out of one —
   [`references/how-the-audit-measures.md`](references/how-the-audit-measures.md).

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

   Where the report carries a site no test reaches, an `inconclusive` site, a coverage
   command proven to under-report, or a unit test that fails once its environment is
   denied, the probe behind that finding is in
   [`references/how-the-audit-measures.md`](references/how-the-audit-measures.md). Read
   it before you explain such a finding or answer how the audit reached it; the relay
   itself needs nothing from it.

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

## Verdicts

The verdict (`strong` | `adequate` | `weak` | `untrustworthy` | `not-auditable` — the
last is an abort report with remediation proposals) and its scoring thresholds are
computed by the workflow; relay them as returned. Below `high`, a surviving mutant the
reachability probe proved *reachable* is labeled `candidate: true` — a possible
equivalent mutant, presented with its diff, never as proof. A survivor proven *unreached*
is never a candidate at any level: nothing there was argued, it was measured.
Delay-injection findings are always candidates: a test failing under an added delay may be
brittle or may encode a legitimate latency contract — the user decides.

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
