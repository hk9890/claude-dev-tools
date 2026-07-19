---
name: test-tests
description: "Empirical test-suite strength audit — proves whether the tests detect injected bugs (mutation kill rate), stay quiet on non-bugs, are flake-free under reruns/shuffle/delays, and run fast. Reports findings and proposals; never keeps an edit."
when_to_use: "Use when the user wants to measure how strong their test suite actually is by running it against injected faults. Triggers on 'test my tests', 'would my tests catch a bug?', 'audit the test suite strength', 'are my tests actually testing anything?', 'inject errors and see if the tests find them'. Not for reading-based test-quality judgment (mock discipline, style, what-matters-untested reasoning) — that is project-review-tests; this skill is the empirical lens: it proves weaknesses by mutating code and running the suite."
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
   - `low` — top 3 components by churn, 3 mutants each, ~6 agents. Quick signal.
   - `medium` (recommended) — all components (cap 8), 5 mutants + no-ops + delay
     probes each, ~12 agents. The standard audit.
   - `high` — cap 12, 8 mutants, 5 reruns, plus an adversarial pass that refutes
     equivalent mutants, ~25 agents. The trustworthy-numbers audit.

   At every level, one rerun uses the runner's native order-shuffle flag (fixed
   seed) when one exists.

   Wall time is dominated by the suite's own speed in every tier.

2. Resolve the install (`$CLAUDE_PLUGIN_ROOT` is not exported to Bash; locate under
   `$HOME`, version-sorted, with `$PWD` covered for dev installs):

   ```bash
   command -v python3 >/dev/null || echo "python3 missing"
   PLUGIN_DIR=$(find "$HOME/.claude/plugins" "$PWD" -type d -path '*project-auto-work*/skills' 2>/dev/null |
     sort -V | tac | while read -r d; do
       [ -f "${d%/skills}/skills/test-tests/workflows/test-tests.js" ] && { printf '%s\n' "${d%/skills}"; break; }
     done)
   SKILL_DIR="$PLUGIN_DIR/skills/test-tests"
   [ -n "$PLUGIN_DIR" ] || echo "skill not located — do not launch"
   ```

3. Snapshot the target tree so integrity is verifiable afterwards, and create a
   per-run scratch dir:

   ```bash
   SCRATCH=$(mktemp -d /tmp/test-tests-XXXXXX)
   git -C "<path>" status --porcelain > "$SCRATCH/pre-status.txt"
   git -C "<path>" diff > "$SCRATCH/pre-diff.patch"
   ( cd "<path>" && git ls-files --others --exclude-standard -z | xargs -0 -r md5sum ) > "$SCRATCH/pre-untracked.md5"
   ```

   The untracked hashes matter: `git diff` is blind to untracked-file content, and a
   mutation left in an untracked production file would otherwise pass the check.

4. Invoke the **Workflow** tool:
   - `scriptPath`: `<SKILL_DIR>/workflows/test-tests.js`
   - `args`: `{ "repoRoot": "<path>", "scriptsDir": "<SKILL_DIR>/scripts", "level": "<level>", "scratchDir": "<SCRATCH>" }`

   The workflow measures four axes — sensitivity (mutants must be killed),
   specificity (no-op edits must not break tests), reliability (reruns, shuffle,
   delay injection), speed — and aborts *with a remediation report* when the suite
   is red, coverage is unobtainable, or the suite is too slow to slice: the report
   then tells the user exactly how to make the repo auditable.

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
audit — report which prerequisite is missing and stop.

## Verdicts

`strong` must be earned: kill rate ≥ ~0.75 across audited components AND zero flakes
AND zero brittle breaks AND a fast suite. `untrustworthy` = red or flaky baseline.
`weak` = low kill rate or proven vacuous tests. `not-auditable` = an abort report
with remediation proposals. Below `high`, surviving mutants are labeled
`candidate: true` — possible equivalent mutants, presented with their diff, never as
proof. Delay-injection findings are always candidates: a test failing under an added
delay may be brittle or may encode a legitimate latency contract — the user decides.

## Not covered

Reading-based test-quality judgment (mock discipline, readability, what-matters
reasoning) → `project-review-tests`. Writing or fixing tests → out of scope by
design; the report's proposals name the missing tests, the user decides what to do.
