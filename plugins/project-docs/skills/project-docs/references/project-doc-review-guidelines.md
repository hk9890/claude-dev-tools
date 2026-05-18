# Review and Validate Project Docs (Read-Only)

Primary entrypoint for the **review/validate without editing** flow.

## Read-only contract (mandatory)

- **No edits:** do not modify docs, source files, configs, or tracker state.
- **Review output only:** return findings, evidence, and suggested fixes.
- **Escalate to update/improve flow for edits:** if user approves changes, switch flows explicitly.

Use with:

- [project-setup.md](project-setup.md)
- [project-structure.md](project-structure.md)
- [project-doc-guidelines.md](project-doc-guidelines.md)

## Review workflow

1. Run `scripts/claude-md.sh check <repo-root>` to verify `CLAUDE.md` is exactly `@AGENTS.md` (one line — any extra content is a BLOCKER finding) (read-only; do not run `init` during review). Run `scripts/inventory.py <repo-root>` to surface missing canonical docs, non-canonical docs, non-canonical subdirs, and location violations as structured findings. Run `scripts/validate-routes.py <repo-root> --include-docs --json` to surface unresolved references as structured findings.
2. Confirm file-role fit using [project-setup.md](project-setup.md).
3. Apply authoring rules from [project-doc-guidelines.md](project-doc-guidelines.md).
4. Verify repository facts (paths, commands, workflows, links) in read-only manner.
5. Produce findings and recommended next flow (`docs-update` for factual fixes, `docs-improve` for structural fixes).

## Required checks

- Canonical steering docs remain the operating layer.
- `project-setup.md` and `project-structure.md` role boundaries are respected.
- Non-standard docs kept after consolidation have explicit scoped justification.
- No duplicate/conflicting operating guidance across canonical docs and retained non-standard docs.
- No stale routes after merge/split/delete actions.
- `CHANGE-WORKFLOW.md` is the canonical destination for change-landing guidance.

## Top-line summary

Lead the report with a single-line headline so readers can triage at a glance:

`Findings: <N> BLOCKER · <N> MAJOR · <N> MINOR — <verdict>`

Verdict:

- `clean` — no findings
- `minor only` — no BLOCKER or MAJOR
- `needs work` — MAJOR present, no BLOCKER
- `fails` — at least one BLOCKER

## Findings format

Return findings as:

`[SEVERITY] <file>:<section> — <rule-id> — <violation> — <evidence> — <suggested fix>`

Severity:

- `BLOCKER`: must-fix correctness or policy violation
- `MAJOR`: high-impact scope/actionability gap
- `MINOR`: clarity/scanability improvement

Rule IDs and default severity:

| Rule | Meaning | Default severity |
|---|---|---|
| `R1` | Repo-local anchor requirement (commands/paths/checklists/decision tables) | MAJOR |
| `R2` | Scan-first structure (short sections, headings, bullets) | MINOR |
| `R3` | Topic boundary (content lives in correct canonical file) | MAJOR |
| `R4` | Skill-aware local delta (no duplicating full skill content) | MAJOR |
| `R5` | Project actionability (commands/paths real and current) | MAJOR |
| `V1` | Validation coverage (links/anchors/paths resolve) | BLOCKER |

Severity may be raised one level when the violation directly causes wrong behavior in real workflows (e.g., a stale command in `RELEASING.md` is R5/BLOCKER, not R5/MAJOR).

## Validation safety model

- Tier A (safe/read-only): run freely
- Tier B (expensive but safe): run as needed to verify meaningful claims
- Tier C (destructive/irreversible): do not execute during routine review; verify indirectly

## Pass criteria

Review passes when:

1. No `BLOCKER` findings remain.
2. Repo-truth checks succeeded for validated claims.
3. Consolidation and routing state is coherent.
