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

1. Resolve mode/path rules via [project-structure.md](project-structure.md).
2. Load target docs and AGENTS routes.
3. Confirm file-role fit using [project-setup.md](project-setup.md).
4. Apply authoring rules from [project-doc-guidelines.md](project-doc-guidelines.md).
5. Verify repository facts (paths, commands, workflows, links) in read-only manner.
6. Produce findings and recommended next flow (`docs-update` for factual fixes, `docs-improve` for structural fixes).

## Required checks

- Canonical steering docs remain the operating layer.
- `project-setup.md` and `project-structure.md` role boundaries are respected.
- Non-standard docs kept after consolidation have explicit scoped justification.
- No duplicate/conflicting operating guidance across canonical docs and retained non-standard docs.
- No stale routes after merge/split/delete actions.
- `CHANGE-WORKFLOW.md` is the canonical destination for change-landing guidance.

## Findings format

Return findings as:

`[SEVERITY] <file>:<section> — <rule-id> — <violation> — <evidence> — <suggested fix>`

Severity:

- `BLOCKER`: must-fix correctness or policy violation
- `MAJOR`: high-impact scope/actionability gap
- `MINOR`: clarity/scanability improvement

Suggested rule IDs:

- `R1` repo-local anchor requirement
- `R2` scan-first structure
- `R3` topic boundary
- `R4` skill-aware local delta
- `R5` project actionability
- `V1` validation coverage

## Validation safety model

- Tier A (safe/read-only): run freely
- Tier B (expensive but safe): run as needed to verify meaningful claims
- Tier C (destructive/irreversible): do not execute during routine review; verify indirectly

## Pass criteria

Review passes when:

1. No `BLOCKER` findings remain.
2. Repo-truth checks succeeded for validated claims.
3. Consolidation and routing state is coherent.
