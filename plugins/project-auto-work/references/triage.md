# Triage

The last step of both skills: act on every item of the report, with nobody watching. A
settled `test-tests` survivor becomes a PR; every other item becomes a taskmgr item; an
item an earlier run already filed gets a comment instead of a second copy.

Both skills reach this file at the plugin root, so `../..` from their base directory is
correct. Placeholders:

- `<PLUGIN>` — `<SKILL_DIR>/../..`
- `<tool>` — `test-tests` or `test-app`
- `<path>` and `<scratch>` — the skill's own
- `<audited-head>` — the commit the skill printed before the audit
- `<output-file>` — the audit workflow's task output file

## The tiers

| Item | Tier | Becomes |
|---|---|---|
| Settled `test-tests` sensitivity survivor that passes every fix gate | 1 | A PR with a test that kills the mutant |
| Any other settled proposal, an open `local` proposal, a question, a finding without a proposal, an aborted run's remediation | 2 | A taskmgr bug, chore or task |
| Open `cross-cutting` proposal | 3 | A taskmgr doc, label `kind:design`. The finding's other proposals make an item of their own; a finding with none is in the doc alone |

`bin/triage-plan.py` applies the tiers, the fix gates and the dedup. Each row of the final
summary names the rule that placed its item, so read the reason there rather than
re-deriving it. A tier-1 fix that fails its proving check is filed as tier 2 with the
failure in its body, or, where an earlier run filed the item, commented on that item. Every filed item carries the label `source:project-auto-work` and one
`dedup:<hash>` label, plus one `dedup-scope:<hash>` label for the tool and path. Each body and each PR carries a `dedup-key:` line. An audit can name
one problem in new words on each run, so an item to file that no key matched goes to one
match agent in the workflow: where an earlier item of the same tool and path is the same
problem, the item becomes a comment on it, or a skip where it was closed as decided, and
the earlier item takes the item's `dedup:` label. A design doc and the other item of one
finding never match each other.

## 1. Check the store

Where the result holds `error` or no `report`, there is nothing to act on: skip the
triage. Otherwise run:

```bash
command -v python3 >/dev/null || echo "missing: python3"
command -v taskmgr >/dev/null || echo "missing: taskmgr"
command -v taskmgr >/dev/null \
  && taskmgr where -C "<path>" --json | grep -q '"kind": *"none"' && echo "missing: taskmgr store"
```

`taskmgr where` exits 0 with no store too, so the check reads its `kind`. Where it prints a
`missing:` line, name what is missing, skip the triage and relay the items as `decision-split.md` (same directory)
describes. The store is the user's to create, so leave `taskmgr init` to them.

This step is the one place that decides whether the triage runs.

## 2. Collect

```bash
taskmgr list --all -C "<path>" --json > "<scratch>/tasks.json"
git -C "<path>" rev-parse HEAD 2>/dev/null || echo none
git -C "<path>" rev-parse --show-prefix 2>/dev/null
```

The first printed line is `<current-head>`; the second, possibly empty, is `<scope>`.

The PRs earlier runs opened, so a fix PR closed without a merge is not opened again. Run it
wherever `gh` is signed in, PR base or not:

```bash
command -v gh >/dev/null && gh auth status >/dev/null 2>&1 \
  && (cd "<path>" && gh pr list --label source:project-auto-work --state all --limit 500 --json number,url,body,state) > "<scratch>/prs.json" \
  || rm -f "<scratch>/prs.json"
```

`test-tests` only — find the PR base. A fix PR is only possible from a pushed branch, with
`gh` signed in:

```bash
command -v gh >/dev/null && gh auth status >/dev/null 2>&1 \
  && git -C "<path>" rev-parse --abbrev-ref --symbolic-full-name '@{upstream}' \
  && test -z "$(git -C "<path>" rev-list '@{upstream}..HEAD')"
```

Where it exits 0 and prints `origin/<branch>`, `<pr-base>` is `<branch>`.
Otherwise, an upstream on another remote included, `<pr-base>` is empty and every settled
item is filed instead of fixed: the fix agent pushes to `origin`.

## 3. Plan

```bash
python3 "<PLUGIN>/bin/triage-plan.py" --tool <tool> --out "<scratch>/triage" \
  --result "<output-file>" --tasks "<scratch>/tasks.json" \
  --audited-head "<audited-head>" --current-head "<current-head>" --scope "<scope>" \
  [--prs "<scratch>/prs.json"] [--pr-base "<pr-base>"]
```

Pass `--prs` where `prs.json` was written, and `--pr-base` where it is not empty. Exit 1 or 2: relay
its stderr, stop the triage, and relay the items as `decision-split.md` describes. Exit 0 prints one JSON line, `<triage-args>`.

## 4. Fix, match and write bodies

Where `<triage-args>` has an empty `fixes` and an empty `bodies`, write `{}` to
`<scratch>/triage/workflow.json` and use that file as `<triage-output-file>` in step 5.
Otherwise invoke the **Workflow** tool:

- `scriptPath`: `<PLUGIN>/workflows/triage.js`
- `args`: `<triage-args>`, verbatim

Its task output file is `<triage-output-file>`. Where its `result` holds `error`, relay it verbatim and still run step 5: it files nothing
that has no body, and it records every item.

## 5. File

```bash
python3 "<PLUGIN>/bin/triage-file.py" --plan-dir "<scratch>/triage" \
  --workflow-result "<triage-output-file>" --repo-root "<path>"
```

It comments, files and records one item at a time and prints the summary table. Exit 1:
relay its stderr, stop the triage, and relay the items as `decision-split.md` describes. Exit 3: the rows marked `not filed` or
`comment failed`, and each `pr` row whose reason names a failed comment, give the reason.

## 6. Report

Show the summary table. Give the count of each value in the Outcome column. State the path `<scratch>/triage/summary.json`:
it lists every PR and taskmgr item this run made, which is how a run is undone. Relay the
line `triage-file.py` printed under the table: it says which closes stop later runs from
filing an item again.

Done when every item has an outcome in the summary and the user has the table, or, where
a step stopped the triage, when the reason it stopped is stated and the items are relayed
as `decision-split.md` describes.
