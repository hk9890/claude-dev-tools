#!/usr/bin/env python3
"""Carry out a triage plan in taskmgr and write the run summary.

Reads <plan-dir>/plan.json (from triage-plan.py) and the triage workflow's return value,
then, one item at a time: comments on the open item a repeated finding matches, files each
item that has a body, and records each PR and skip. Writes <plan-dir>/summary.json and
prints the summary as Markdown.

usage: triage-file.py --plan-dir <dir> --workflow-result <file> --repo-root <path>

--workflow-result takes the triage workflow's task output file, or its `result` value
alone.

Exit 0 when every item was carried out, 3 when one or more could not be, 1 on unreadable
input.
"""
import argparse
import json
import os
import subprocess
import sys


def taskmgr(repo_root, *argv):
    """Run taskmgr against the repo's store; return (ok, parsed --json output or stderr)."""
    proc = subprocess.run(['taskmgr', *argv, '-C', repo_root, '--json'], capture_output=True, text=True)
    if proc.returncode != 0:
        return False, (proc.stderr or proc.stdout).strip()
    try:
        return True, json.loads(proc.stdout)
    except ValueError:
        return True, proc.stdout.strip()


def file_item(repo_root, item, title, body_path):
    argv = ['create', '--title', title, '--type', item['type'], '--priority', str(item['priority']),
            '--description-file', body_path]
    for label in item['labels']:
        argv += ['--label', label]
    for rid in item.get('related') or []:
        argv += ['--related', rid]
    ok, out = taskmgr(repo_root, *argv)
    if not ok:
        return None, out
    return (out.get('id') if isinstance(out, dict) else None), None


def carry_out(plan, workflow, repo_root, plan_dir):
    fixes = {f['n']: f for f in workflow.get('fixes') or [] if f}
    bodies = {b['n']: b for b in workflow.get('bodies') or [] if b}
    head = (plan['context'].get('audited_head') or '')[:12] or 'an unknown commit'
    note = f'Seen again by {plan["context"]["tool"]} at {head}.'
    rows = []
    for item in plan['items']:
        row = {'n': item['n'], 'key': item['key'], 'tier': item['tier'], 'reason': item['reason']}
        action = item['action']
        fix = fixes.get(item['n'])
        if action == 'fix' and fix and fix.get('status') == 'pr':
            row.update(outcome='pr', ref=fix.get('url'))
            rows.append(row)
            continue
        if action == 'fix':
            item = {**item, 'tier': 2}
            row.update(tier=2, reason=f'fix attempt failed: {(fix or {}).get("reason") or "fix agent returned nothing"}')
            action = 'file'
        if action == 'skip':
            row.update(outcome='skipped', ref=', '.join(item.get('existing') or []))
        elif action == 'note':
            failed = [tid for tid in item['existing'] if not taskmgr(repo_root, 'comment', 'add', tid, note)[0]]
            row.update(outcome='comment failed' if failed else 'noted', ref=', '.join(item['existing']))
        else:
            body = bodies.get(item['n'])
            body_path = os.path.join(plan_dir, f'body-{item["n"]}.md')
            if not body or not body.get('title') or not os.path.isfile(body_path):
                row.update(outcome='not filed', ref='', reason=row['reason'] + '; the body agent returned nothing')
            else:
                tid, err = file_item(repo_root, item, body['title'], body_path)
                row.update(outcome='filed' if tid else 'not filed', ref=tid or '',
                           reason=row['reason'] + (f'; taskmgr refused: {err}' if err else ''))
        rows.append(row)
    return rows


def markdown(rows):
    lines = ['| # | Tier | Outcome | Ref | Why | dedup key |', '|---|---|---|---|---|---|']
    lines += [f'| {r["n"]} | {r["tier"]} | {r["outcome"]} | {r["ref"]} | {r["reason"]} | `{r["key"]}` |' for r in rows]
    return '\n'.join(lines)


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument('--plan-dir', required=True)
    ap.add_argument('--workflow-result', required=True)
    ap.add_argument('--repo-root', required=True)
    args = ap.parse_args(argv)
    try:
        with open(os.path.join(args.plan_dir, 'plan.json')) as fh:
            plan = json.load(fh)
        with open(args.workflow_result) as fh:
            workflow = json.load(fh) or {}
        if 'result' in workflow and 'fixes' not in workflow:
            workflow = workflow['result'] or {}
    except (OSError, ValueError) as exc:
        print(f'triage-file: cannot read input: {exc}', file=sys.stderr)
        return 1

    rows = carry_out(plan, workflow, args.repo_root, args.plan_dir)
    with open(os.path.join(args.plan_dir, 'summary.json'), 'w') as fh:
        json.dump(rows, fh, indent=2)
    print(markdown(rows))
    return 3 if any(r['outcome'] in ('not filed', 'comment failed') for r in rows) else 0


if __name__ == '__main__':
    sys.exit(main())
