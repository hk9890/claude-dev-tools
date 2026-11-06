#!/usr/bin/env python3
"""Plan the triage of one project-auto-work audit result.

Reads the audit workflow's return value, puts every report item in a tier, applies the
tier-1 gates and the cross-run dedup, and writes one JSON file per item for the triage
workflow and triage-file.py. references/triage.md states the rules this implements.

usage: triage-plan.py --tool test-tests|test-app --result <file> --tasks tasks.json
                      --out <dir> [--prs prs.json] [--pr-base <branch>] [--scope <prefix>]
                      [--audited-head <sha>] [--current-head <sha>]

--result takes the audit workflow's task output file, or its `result` value alone.
--scope is the audited path relative to the repository root, so audits of two paths that
share one taskmgr store keep apart keys.
Prints the triage workflow's args as JSON. Exit 0 on a plan, 2 when the result holds no
report to triage, 1 on unreadable input.
"""
import argparse
import hashlib
import json
import os
import re
import sys

SOURCE_LABEL = 'source:project-auto-work'
PR_CAP = 3
NO_FIX_VERDICTS = {'untrustworthy', 'not-auditable', 'not-runnable'}
SEVERITY_PRIORITY = {'blocker': 1, 'major': 2, 'minor': 3}
# The close reasons that stop later runs from filing an item again. triage-file.py prints
# them under its summary, so the user learns them from this one list.
WONTFIX_WORDS = ("won't fix", 'not planned', 'declined', 'rejected', 'duplicate', 'invalid')
WONTFIX = re.compile(r"\s*(won'?t[ -]?fix|not planned|declined|rejected|duplicate|invalid)\b", re.I)
STOP_REFILING = ('Later runs file an item again unless it is closed with a reason that starts with '
                 + ', '.join(f'"{w}"' for w in WONTFIX_WORDS)
                 + ', or it is a task or design doc closed for any reason. A fix PR closed without a merge is not opened again.')
DEDUP_LINE = re.compile(r'^dedup-key: (.+)$', re.M)


def normalize(text):
    return re.sub(r'\s+', ' ', str(text or '')).strip().lower()


def dedup_label(key):
    return 'dedup:' + hashlib.sha1(key.encode()).hexdigest()[:12]


def survived_mutants(raw, site):
    """The SURVIVED mutants at file:line, from workers that passed their integrity check."""
    path, _, line = (site or '').rpartition(':')
    return [m for worker in (raw or {}).get('workers') or [] if worker and worker.get('integrity_ok') is not False
            for m in worker.get('mutants') or []
            if path and m.get('outcome') == 'SURVIVED' and m.get('file') == path and str(m.get('line')) == line.strip()]


def by_id(entries, prefix):
    """Index report entries by id. A repeated or missing id gets a fresh one, so no entry is
    dropped; proposals keep pointing at the first entry that carried the id."""
    index = {}
    for n, entry in enumerate(entries or [], 1):
        eid = entry.get('id') or f'{prefix}{n}'
        while eid in index:
            eid = f'{eid}#{n}'
        index[eid] = entry
    return index


def group_items(tool, result, scope=''):
    """One item per finding with its proposals, per question, and per orphan proposal.
    An aborted run is one remediation item holding every proposal."""
    report = result['report']
    findings = by_id(report.get('findings'), 'F?')
    questions = by_id(report.get('questions'), 'Q?')
    prefix = f'{tool}|{scope}|' if scope else f'{tool}|'

    if result.get('aborted'):
        reason = (result.get('abort_reason') or 'unknown').split(' — ')[0]
        return [{'kind': 'remediation', 'finding': next(iter(findings.values()), None),
                 'proposals': report.get('proposals') or [], 'key': f'{prefix}abort|{normalize(reason)}'}]

    by_target, orphans = {}, []
    for p in report.get('proposals') or []:
        target = p.get('related_finding_id') or ''
        if target in findings or target in questions:
            by_target.setdefault(target, []).append(p)
        else:
            orphans.append(p)

    items = []
    for fid, f in findings.items():
        axis = f'{f.get("axis")}|' if tool == 'test-tests' else ''
        key = f'{prefix}{axis}{normalize(f.get("subject"))}'
        items.append({'kind': 'finding', 'finding': f, 'proposals': by_target.get(fid, []), 'key': key})
    for qid, q in questions.items():
        items.append({'kind': 'question', 'question': q, 'proposals': by_target.get(qid, []),
                      'key': f'{prefix}question|{normalize(q.get("subject") or q.get("title"))}'})
    for p in orphans:
        items.append({'kind': 'proposal', 'proposals': [p], 'key': f'{prefix}proposal|{normalize(p.get("action"))}'})
    return merge_by_key(items)


def merge_by_key(items):
    """One item per dedup key: findings that share a key share one filed item, so a later
    run matches the item they made together. The first keeps its place; the rest move into
    'more_findings' and their proposals join its own."""
    merged = {}
    for item in items:
        first = merged.get(item['key'])
        if first is None:
            merged[item['key']] = item
            continue
        first.setdefault('more_findings', []).append(item.get('finding') or item.get('question') or {})
        first['proposals'] = first['proposals'] + item['proposals']
    return list(merged.values())


def place(item, tool, result, run_block):
    """Set the item's tier, type, priority and the reason that placed it."""
    props = item['proposals']
    findings = [item.get('finding') or {}] + item.get('more_findings', [])
    open_props = [p for p in props if p.get('decision') != 'settled']
    item['priority'] = min(SEVERITY_PRIORITY.get(f.get('severity'), 2) for f in findings)
    work_type = 'bug' if tool == 'test-app' else 'chore'

    if any(p.get('scope') == 'cross-cutting' for p in open_props):
        item.update(tier=3, type='doc', reason='open cross-cutting proposal')
    elif item['kind'] == 'question':
        item.update(tier=2, type='task', reason='question the run could not settle')
    elif open_props:
        item.update(tier=2, type='task', reason='open proposal')
    elif not props:
        item.update(tier=2, type=work_type, reason='finding without a proposal')
    elif item['kind'] == 'remediation':
        item.update(tier=2, type='task', reason='aborted run: remediation is never fixed unattended')
    else:
        gate = tier1_gate(item, tool, result, run_block)
        item.update(tier=2 if gate else 1, type=work_type,
                    reason=f'settled, not fixed: {gate}' if gate else 'settled survivor fix')


def tier1_gate(item, tool, result, run_block):
    """The first tier-1 gate the item fails, or None."""
    finding = item.get('finding') or {}
    if tool != 'test-tests':
        return 'test-app items are never fixed unattended'
    if run_block:
        return run_block
    if result['report'].get('verdict') in NO_FIX_VERDICTS:
        return f'verdict is {result["report"].get("verdict")}'
    if finding.get('axis') != 'sensitivity':
        return f'axis {finding.get("axis")} has no proving check'
    if finding.get('candidate'):
        return 'the finding is a candidate (possible equivalent mutant)'
    if item.get('more_findings'):
        return 'several findings share this item'
    if len(item['proposals']) != 1:
        return 'more than one proposal on the finding'
    mutants = survived_mutants(result.get('raw'), finding.get('site'))
    if len(mutants) != 1:
        return f'{len(mutants)} surviving mutants recorded at site {finding.get("site") or "(none)"}, need exactly 1'
    item['mutant'] = mutants[0]
    return None


def run_block(result, args):
    """Why no item of this run may be fixed, or '' when fixes are allowed."""
    if not args.pr_base:
        return 'no PR base: HEAD has no pushed upstream, or gh is unavailable'
    if not args.audited_head or args.audited_head != args.current_head:
        return 'HEAD moved after the audit started'
    if result.get('mode') != 'worktree':
        return 'the audit ran in live-tree mode'
    if ((result.get('raw') or {}).get('baseline') or {}).get('dirty_tree'):
        return 'the audited tree had uncommitted changes'
    return ''


def existing_by_label(tasks):
    index = {}
    for t in tasks:
        labels = t.get('labels') or []
        if SOURCE_LABEL in labels:
            for label in labels:
                if label.startswith('dedup:'):
                    index.setdefault(label, []).append(t)
    return index


def pr_keys(prs):
    """Keys of PRs an earlier run opened that are still open, or closed without a merge.
    A merged PR fixed its item, so its key coming back is a regression to act on."""
    return {key.strip(): pr.get('url') or str(pr.get('number'))
            for pr in prs if pr.get('state') != 'MERGED'
            for key in DEDUP_LINE.findall(pr.get('body') or '')}


def decided(task):
    """A closed item whose close settles the matter for later runs: closed as won't-fix, or a
    task or design doc, which closes on a decision rather than on a fix."""
    return bool(WONTFIX.match(task.get('close_reason') or '')) or task.get('type') in ('task', 'doc')


def dedup(item, existing, pr_keys):
    """Set item['action'] to fix, file, note or skip. A fixable item an earlier run filed is
    still fixed; triage-file.py then comments the PR onto the open item."""
    matches = existing.get(item['label'], [])
    open_matches = [t['id'] for t in matches if t.get('status') != 'closed']
    closed = [t for t in matches if t.get('status') == 'closed']
    if item['key'] in pr_keys:
        item.update(action='skip', existing=[pr_keys[item['key']]],
                    reason='a PR from an earlier run, open or closed unmerged, carries this key')
    elif open_matches:
        item.update(action='fix' if item['tier'] == 1 else 'note', existing=open_matches)
    elif closed and all(decided(t) for t in closed):
        item.update(action='skip', existing=[t['id'] for t in closed], reason="closed as decided or won't-fix")
    else:
        item['related'] = [t['id'] for t in closed]
        if closed:
            item['reason'] += '; regression of a closed item'
        item['action'] = 'fix' if item['tier'] == 1 else 'file'


def load(path, default):
    """Read a JSON file; a missing path or an empty file is the default."""
    if not path:
        return default
    with open(path) as fh:
        text = fh.read()
    return json.loads(text) if text.strip() else default


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument('--tool', required=True, choices=['test-tests', 'test-app'])
    ap.add_argument('--result', required=True)
    ap.add_argument('--tasks', required=True)
    ap.add_argument('--prs')
    ap.add_argument('--pr-base', default='')
    ap.add_argument('--audited-head', default='')
    ap.add_argument('--current-head', default='')
    ap.add_argument('--scope', default='')
    ap.add_argument('--out', required=True)
    args = ap.parse_args(argv)

    try:
        result = load(args.result, None)
        tasks = load(args.tasks, [])
        prs = load(args.prs, [])
    except (OSError, ValueError) as exc:
        print(f'triage-plan: cannot read input: {exc}', file=sys.stderr)
        return 1
    if isinstance(result, dict) and 'result' in result and 'report' not in result:
        result = result['result']
    if not isinstance(result, dict) or result.get('error') or not result.get('report'):
        print('triage-plan: the result holds no report to triage', file=sys.stderr)
        return 2

    block = run_block(result, args)
    existing, keys = existing_by_label(tasks), pr_keys(prs)
    items = group_items(args.tool, result, args.scope.strip('/'))
    fixes = 0
    for n, item in enumerate(items, 1):
        item['n'] = n
        item['label'] = dedup_label(item['key'])
        place(item, args.tool, result, block)
        dedup(item, existing, keys)
        if item['action'] == 'fix':
            fixes += 1
            if fixes > PR_CAP:
                item.update(tier=2, action='note' if item.get('existing') else 'file', reason=f'{item["reason"]}; not fixed: PR cap of {PR_CAP} reached')
        item['labels'] = [SOURCE_LABEL, item['label']] + (['kind:design'] if item['tier'] == 3 else [])

    os.makedirs(args.out, exist_ok=True)
    baseline = (result.get('raw') or {}).get('baseline') or {}
    context = {'tool': args.tool, 'repoRoot': result.get('repoRoot'), 'level': result.get('level'),
               'verdict': result['report'].get('verdict'), 'headline': result['report'].get('headline'),
               'test_cmd': baseline.get('test_cmd'), 'worktree_setup': baseline.get('worktree_setup', ''),
               'audited_head': args.audited_head, 'pr_base': args.pr_base,
               'build_drift': result.get('build_drift') or '', 'stop_refiling': STOP_REFILING}
    for item in items:
        with open(os.path.join(args.out, f'item-{item["n"]}.json'), 'w') as fh:
            json.dump({**item, 'context': context}, fh, indent=2)
    with open(os.path.join(args.out, 'plan.json'), 'w') as fh:
        json.dump({'context': context, 'run_block': block, 'items': items}, fh, indent=2)

    print(json.dumps({
        'repoRoot': result.get('repoRoot'), 'scratchDir': result.get('scratchDir'),
        'planDir': os.path.abspath(args.out), 'tool': args.tool,
        # Fixes run the suite in parallel only where the audit proved that safe.
        'serial': not result.get('parallel_workers'),
        'fixes': [i['n'] for i in items if i['action'] == 'fix'],
        # A failed fix of an item an earlier run filed becomes a comment on it, not a body.
        'filed': [i['n'] for i in items if i['action'] == 'fix' and i.get('existing')],
        'bodies': [i['n'] for i in items if i['action'] == 'file'],
    }))
    return 0


if __name__ == '__main__':
    sys.exit(main())
