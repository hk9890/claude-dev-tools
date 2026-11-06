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

    def comment(ids, text):
        """Comment on each id; return 'noted', or 'comment failed' when any comment failed."""
        failed = [tid for tid in ids if not taskmgr(repo_root, 'comment', 'add', tid, text)[0]]
        return 'comment failed' if failed else 'noted'

    for item in plan['items']:
        row = {'n': item['n'], 'key': item['key'], 'tier': item['tier'], 'reason': item['reason']}
        action = item['action']
        fix = fixes.get(item['n'])
        existing = item.get('existing') or []
        if action == 'fix' and fix and fix.get('status') == 'pr':
            noted = comment(existing, f'{note} Fix PR: {fix.get("url")}') if existing else 'noted'
            row.update(outcome='pr', ref=fix.get('url'), comment_failed=noted != 'noted')
            if row['comment_failed']:
                row['reason'] += f'; the comment on {", ".join(existing)} failed'
            rows.append(row)
            continue
        if action == 'fix':
            failure = (fix or {}).get('reason') or 'fix agent returned nothing'
            item = {**item, 'tier': 2}
            row.update(tier=2, reason=f'fix attempt failed: {failure}')
            if existing:
                row.update(outcome=comment(existing, f'{note} An unattended fix failed: {failure}'), ref=', '.join(existing))
                rows.append(row)
                continue
            action = 'file'
        if action == 'skip':
            row.update(outcome='skipped', ref=', '.join(item.get('existing') or []))
        elif action == 'note':
            row.update(outcome=comment(existing, note), ref=', '.join(existing))
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


def cell(value):
    """One Markdown table cell: dedup keys carry '|', and taskmgr errors span lines."""
    return ' '.join(str(value).split()).replace('|', '\\|')


def markdown(rows):
    lines = ['| # | Tier | Outcome | Ref | Why | dedup key |', '|---|---|---|---|---|---|']
    lines += ['| ' + ' | '.join(cell(r[k]) for k in ('n', 'tier', 'outcome', 'ref', 'reason', 'key')) + ' |' for r in rows]
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
    return 3 if any(r['outcome'] in ('not filed', 'comment failed') or r.get('comment_failed') for r in rows) else 0


if __name__ == '__main__':
    sys.exit(main())
