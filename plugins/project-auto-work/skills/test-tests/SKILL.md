---
name: test-tests
description: "Empirical test-suite strength audit: mutation kill rate, flake, speed and unit isolation, measured rather than read. With a taskmgr store, files its findings there and opens a PR for each settled survivor it can prove fixed."
user-invocable: true
disable-model-invocation: true
argument-hint: "[low|medium|high|ultra] [path]"
---

Empirical test-suite strength audit. Launch the audit workflow — do **not** probe the
suite inline. It returns a structured report.

The audit temporarily mutates production code to check that tests fail, inside its own
git worktrees when the suite can run there, or in the live tree under a backup/restore
protocol when it cannot — either way every edit is reverted and integrity-checked.
The audit itself commits nothing, writes no test and installs nothing. The triage step
after it acts where the project has a taskmgr store: a settled survivor gets a test on its
own branch and a PR, and every other item is filed in taskmgr.

## Run the workflow

`SKILL_DIR` below is the **base directory for this skill**, given at the top of this file
when the skill loads. It is absolute and install-correct — build every path from it.

1. Parse `$ARGUMENTS` as `[low|medium|high|ultra] [path]`. Both are optional. A leading
   `low` | `medium` | `high` | `ultra` token is the **level**. Everything left is the
   target path (default: the repo root — resolve a free-form description to
   a directory or fall back to the root). `<path>` in the steps below is that
   target as an absolute path.

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
   costs more of it than a strong one: every mutant that survives earns one extra run —
   the reachability probe, which re-runs the slice with a throw at the same site to
   settle whether any test reaches the line at all.

2. Check the prerequisite, snapshot the target tree so integrity is verifiable afterwards,
   and create a per-run scratch dir. Echo the scratch path: shell state does not survive
   between commands, so a value you only assign is gone by the time step 3 needs it.
   `<scratch>` in steps 3-6 is that printed absolute path, and the printed commit is
   `<audited-head>`: the triage opens a fix only against the commit the audit measured.

   ```bash
   command -v python3 >/dev/null || { echo "python3 missing — stop and tell the user"; return 1 2>/dev/null || exit 1; }
   git -C "<path>" rev-parse HEAD
   SCRATCH=$(mktemp -d /tmp/test-tests-XXXXXX) && echo "$SCRATCH" || { echo "mktemp failed — stop; do not launch without a scratch dir"; return 1 2>/dev/null || exit 1; }
   git -C "<path>" status --porcelain > "$SCRATCH/pre-status.txt"
   git -C "<path>" diff > "$SCRATCH/pre-diff.patch"
   ( cd "<path>" && git ls-files --others --exclude-standard -z | xargs -0 -r cksum ) > "$SCRATCH/pre-untracked.cksum"
   ```

   The untracked checksums matter: `git diff` is blind to untracked-file content, and a
   mutation left in an untracked production file would otherwise pass the check.

3. Invoke the **Workflow** tool:
   - `scriptPath`: `<SKILL_DIR>/workflows/test-tests.js`
   - `args`: `{ "repoRoot": "<path>", "scriptsDir": "<SKILL_DIR>/scripts", "level": "<level>", "scratchDir": "<scratch>" }`

   The workflow measures six axes — sensitivity (mutants must be killed),
   specificity (no-op edits must not break tests), reliability (reruns, shuffle,
   delay injection), speed, isolation (unit tests must survive losing their external
   environment), auditability (what the repository lets an audit verify) — and
   aborts *with a remediation report* rather than guessing. It aborts when:

   - the suite is too slow to finish inside the cap
   - the suite is red
   - no component could be grouped for audit
   - no audited component produced a mutant, leaving nothing scoreable

   The report then tells the user exactly how to make the repo auditable.

   A missing coverage report is **not** on that list: the audit measures reachability
   itself rather than reading it out of one —
   [`references/how-the-audit-measures.md`](references/how-the-audit-measures.md).

   The audit also stops taking on new components once findings reach the workflow's
   `FINDINGS_CAP`. Components it never mutated land in `not_checked`, and the headline
   says the run was capped — `kill_rate` is then a rate over the components that ran.

4. **Verify tree integrity** — after the workflow returns *or* fails:

   ```bash
   git -C "<path>" status --porcelain > "<scratch>/post-status.txt"
   git -C "<path>" diff > "<scratch>/post-diff.patch"
   ( cd "<path>" && git ls-files --others --exclude-standard -z | xargs -0 -r cksum ) > "<scratch>/post-untracked.cksum"
   diff "<scratch>/pre-status.txt" "<scratch>/post-status.txt" \
     && cmp -s "<scratch>/pre-diff.patch" "<scratch>/post-diff.patch" \
     && diff "<scratch>/pre-untracked.cksum" "<scratch>/post-untracked.cksum" \
     && echo "integrity: no drift" || echo "integrity: DRIFT"
   git -C "<path>" worktree list   # audit worktrees live under <scratch>
   ```

   On `integrity: DRIFT`: inspect it, restore leftover mutations from the
   worker backups under `<scratch>/backup-*/` (live-tree mode — each backup file's
   path relative to its `backup-N/` dir is its repo-relative path; copy it back,
   never `git checkout`), and tell the user exactly what was found and restored.
   If `git worktree list` still shows entries under `<scratch>`, remove each with
   `git -C "<path>" worktree remove --force <wt>` and finish with
   `git -C "<path>" worktree prune`.

5. Relay the report. The workflow returns
   `{ report: { verdict, headline, scores, findings[], proposals[], … }, raw, … }`,
   under `result` in its task output file — surface `.report` in full, and do not
   re-derive or soften it. Also save it as markdown to `<scratch>/test-tests-report.md`
   (outside the repo) and state that path. For a "did you
   really check X?" follow-up, **re-run the skill**; never answer from the report
   alone.

   Where the report carries a site no test reaches, an `inconclusive` site, a coverage
   command proven to under-report, or a unit test that fails once its environment is
   denied, the probe behind that finding is in
   [`references/how-the-audit-measures.md`](references/how-the-audit-measures.md). Read
   it before you explain such a finding or answer how the audit reached it.

6. **Triage** — after the step-4 integrity check, never before it. Follow
   `<SKILL_DIR>/../../references/triage.md` (plugin-root layout: `../..` is correct)
   with `<tool>` = `test-tests`. Done when its summary table has an outcome for every
   item; where that file skips the triage, when the items are relayed as it says; where
   a step stops the triage, when the reason it stopped is stated and the items are
   relayed as `decision-split.md` describes.

If `python3` is missing or the workflow cannot launch, do not improvise an inline
audit — report which prerequisite is missing and stop. If `result` holds an
object with `error` and no `report` (bad arguments, or the baseline agent died),
relay the error verbatim, state that the audit did not run, and do not improvise
findings — still run the step-4 integrity check. When the error carries `got`, the
run never started: surface `got.keys`, the arguments that arrived. A null `report`
with no `error` means the abort-report or synthesis agent died: say so, and relay
`abort_reason` where set, else `raw`, as not synthesized.

## Not covered

Reading-based judgment about tests — whether a mock hides the failure path nobody tests,
whether an expensive test covers a risk a fast one cannot, whether the test code is
maintainable → `project-review:project-review-codebase`, which reviews test code across
its consistency, structure and architecture dimensions. Any test beyond one that kills a
settled survivor → filed in taskmgr by the triage, for the user to do.
