---
name: test-tests
description: "Empirical test-suite strength audit — proves whether the tests detect injected bugs (mutation kill rate), stay quiet on non-bugs, are flake-free under reruns/shuffle/delays, and run fast. Reports findings and proposals; never keeps an edit."
user-invocable: true
disable-model-invocation: true
argument-hint: "[low|medium|high] [path]"
---

Empirical test-suite strength audit. Launch the audit workflow — do **not** probe the
suite inline. The workflow returns a structured report; relay it and save it to a file.

The audit temporarily mutates production code to check that tests fail, inside its own
git worktrees when the suite can run there, or in the live tree under a backup/restore
protocol when it cannot — either way every edit is reverted and integrity-checked.
Nothing is ever committed, no test is written, nothing is installed.

## Run the workflow

1. Parse `$ARGUMENTS` as `[low|medium|high] [path]`. Both optional. A leading
   `low` | `medium` | `high` token is the **level**; everything after it is the target
   path (default: the repo root — resolve a free-form description to a directory or
   fall back to the root).

   If no level token is given, ask with `AskUserQuestion` (header "Level"):
   - `low` — the highest-churn components, a few mutants each. Quick signal.
   - `medium` (recommended) — all components (capped), plus no-op and delay probes.
     The standard audit.
   - `high` — the deepest dials, plus an adversarial pass that refutes equivalent
     mutants. The trustworthy-numbers audit.

   The exact per-level dials live in the workflow's `DIALS` table.

   At every level, one rerun uses the runner's native order-shuffle flag (fixed
   seed) when one exists.

   Wall time is dominated by the suite's own speed in every tier.

2. `SKILL_DIR` is the **base directory for this skill**, given at the top of this file when
   the skill loads. It is absolute and install-correct — build every path below from it.

3. Check the prerequisite, snapshot the target tree so integrity is verifiable afterwards,
   and create a per-run scratch dir. Echo the scratch path: shell state does not survive
   between commands, so a value you only assign is gone by the time step 4 needs it.

   ```bash
   command -v python3 >/dev/null || { echo "python3 missing — stop and tell the user"; return 2>/dev/null || exit 1; }
   SCRATCH=$(mktemp -d /tmp/test-tests-XXXXXX) && echo "SCRATCH=$SCRATCH"
   git -C "<path>" status --porcelain > "$SCRATCH/pre-status.txt"
   git -C "<path>" diff > "$SCRATCH/pre-diff.patch"
   ( cd "<path>" && git ls-files --others --exclude-standard -z | xargs -0 -r md5sum ) > "$SCRATCH/pre-untracked.md5"
   ```

   The untracked hashes matter: `git diff` is blind to untracked-file content, and a
   mutation left in an untracked production file would otherwise pass the check.

4. Invoke the **Workflow** tool:
   - `scriptPath`: `<SKILL_DIR>/workflows/test-tests.js`
   - `args`: `{ "repoRoot": "<path>", "scriptsDir": "<SKILL_DIR>/scripts", "level": "<level>", "scratchDir": "<the echoed SCRATCH>" }`

   The workflow measures four axes — sensitivity (mutants must be killed),
   specificity (no-op edits must not break tests), reliability (reruns, shuffle,
   delay injection), speed — and aborts *with a remediation report* rather than
   guessing. It aborts when:

   - the suite is too slow to finish inside the cap
   - the suite is red
   - the repository exposes no conforming coverage-summary command
     (see [Coverage comes from the repository](#coverage-comes-from-the-repository))
   - no component could be grouped for audit
   - no audited component produced a mutant, leaving nothing scoreable

   The report then tells the user exactly how to make the repo auditable.

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

If `python3` is missing or the workflow cannot launch, do not improvise an inline
audit — report which prerequisite is missing and stop. If the workflow returns an
object with `error` and no `report` (bad arguments, or the baseline agent died),
relay the error verbatim, state that the audit did not run, and do not improvise
findings — still run the step-5 integrity check.

## Coverage comes from the repository

This audit never parses coverage formats — that is what keeps the plugin
technology-independent. The target repository must expose a command, discovered from
its own docs like the test command, that emits a coverage summary as JSON on stdout
conforming to [`references/coverage-summary-schema.md`](references/coverage-summary-schema.md)
(a `files` array of repo-relative path + covered/uncovered line ranges). The workflow
runs it, validates the output with `scripts/validate-coverage-summary.py`, and mutates
only covered lines. No conforming command → the audit aborts with a remediation report
telling the user what command to add and how to document it. All format-specific work
lives in the repo, never here.

## Verdicts

The verdict (`strong` | `adequate` | `weak` | `untrustworthy` | `not-auditable` — the
last is an abort report with remediation proposals) and its scoring thresholds are
computed by the workflow; relay them as returned. Below `high`, surviving mutants are
labeled `candidate: true` — possible equivalent mutants, presented with their diff,
never as proof. Delay-injection findings are always candidates: a test failing under
an added delay may be brittle or may encode a legitimate latency contract — the user
decides.

## Not covered

Reading-based test-quality judgment (mock discipline, readability, what-matters
reasoning) → `project-review-tests`. Writing or fixing tests → out of scope by
design; the report's proposals name the missing tests, the user decides what to do.
