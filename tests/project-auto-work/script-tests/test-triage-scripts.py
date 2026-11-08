"""Unit tests for plugins/project-auto-work/bin/triage-plan.py and triage-file.py.

Run by test-triage-scripts.sh. triage-file.py is driven against a stub taskmgr on PATH
that logs its argv, so no store is touched.
"""
import importlib.util
import json
import os
import stat
import subprocess
import sys
import tempfile
import unittest

BIN = os.path.join(os.path.dirname(os.path.abspath(__file__)), '../../../plugins/project-auto-work/bin')


def load(name):
    spec = importlib.util.spec_from_file_location(name.replace('-', '_'), os.path.join(BIN, f'{name}.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


plan_mod = load('triage-plan')
HEAD = 'a' * 40


def finding(fid, axis='sensitivity', **kw):
    return {'id': fid, 'axis': axis, 'subject': f'src/{fid}.py::run', 'site': f'src/{fid}.py:10',
            'severity': 'major', 'observation': 'o', 'evidence': 'e', 'implication': 'i', 'candidate': False, **kw}


def settled(fid):
    return {'action': f'add a test for {fid}', 'rationale': 'r', 'related_finding_id': fid, 'decision': 'settled'}


def mutant(fid):
    return {'file': f'src/{fid}.py', 'line': 10, 'diff': '-a\n+b', 'operator': 'negate-condition',
            'stated_behavior_change': 's', 'outcome': 'SURVIVED', 'reached': 'yes'}


def tt_result(findings, proposals, mutants=(), **kw):
    return {'repoRoot': '/repo', 'level': 'medium', 'mode': 'worktree', 'scratchDir': '/tmp/s',
            'report': {'verdict': 'weak', 'headline': 'h', 'findings': findings, 'proposals': proposals},
            'raw': {'baseline': {'test_cmd': 'make test', 'dirty_tree': False, 'worktree_setup': ''},
                    'workers': [{'component': 'c', 'mutants': list(mutants)}]}, **kw}


class PlanTest(unittest.TestCase):
    def plan(self, result, tasks=(), prs=(), tool='test-tests', pr_base='master', current=HEAD, scope=''):
        with tempfile.TemporaryDirectory() as d:
            paths = {}
            for name, data in (('result', result), ('tasks', list(tasks)), ('prs', list(prs))):
                paths[name] = os.path.join(d, f'{name}.json')
                with open(paths[name], 'w') as fh:
                    json.dump(data, fh)
            out = os.path.join(d, 'plan')
            argv = ['--tool', tool, '--result', paths['result'], '--tasks', paths['tasks'], '--prs', paths['prs'],
                    '--pr-base', pr_base, '--audited-head', HEAD, '--current-head', current, '--scope', scope,
                    '--out', out]
            proc = subprocess.run([sys.executable, os.path.join(BIN, 'triage-plan.py'), *argv],
                                  capture_output=True, text=True)
            if proc.returncode != 0:
                return proc.returncode, None, None
            with open(os.path.join(out, 'plan.json')) as fh:
                plan = json.load(fh)
            self.assertTrue(os.path.isfile(os.path.join(out, 'item-1.json')))
            return 0, json.loads(proc.stdout), {i['finding']['id'] + ('|design' if i['kind'] == 'design' else '')
                                                if i.get('finding') else i['key']: i for i in plan['items']}

    def test_settled_survivor_is_fixed(self):
        _, args, items = self.plan(tt_result([finding('F1')], [settled('F1')], [mutant('F1')]))
        self.assertEqual((items['F1']['tier'], items['F1']['action']), (1, 'fix'))
        self.assertEqual(items['F1']['mutant']['diff'], '-a\n+b')
        self.assertEqual((args['fixes'], args['bodies']), ([1], []))

    def test_tier_mapping(self):
        findings = [finding('F2', candidate=True), finding('F3', axis='reliability'), finding('F4'), finding('F5'),
                    finding('F6'), finding('F7')]
        proposals = [settled('F2'), settled('F3'),
                     {**settled('F4'), 'decision': 'open', 'scope': 'cross-cutting', 'options': ['a', 'b']},
                     {**settled('F5'), 'decision': 'open', 'scope': 'local', 'options': ['a', 'b']}, settled('F7')]
        _, _, items = self.plan(tt_result(findings, proposals, [mutant('F2')]))
        got = {k: (v['tier'], v['type']) for k, v in items.items()}
        self.assertEqual(got['F2'], (2, 'chore'))
        self.assertIn('candidate', items['F2']['reason'])
        self.assertEqual(got['F3'], (2, 'chore'))
        self.assertIn('no proving check', items['F3']['reason'])
        self.assertEqual(got['F4|design'], (3, 'doc'))
        self.assertIn('kind:design', items['F4|design']['labels'])
        self.assertNotIn('F4', items)
        self.assertEqual(got['F5'], (2, 'task'))
        self.assertEqual(got['F6'], (2, 'chore'))
        self.assertIn('0 surviving mutants', items['F7']['reason'])

    def test_design_proposal_leaves_the_fix_of_its_finding(self):
        design = {**settled('F1'), 'decision': 'open', 'scope': 'cross-cutting', 'options': ['a', 'b']}
        _, args, items = self.plan(tt_result([finding('F1')], [settled('F1'), design], [mutant('F1')]))
        self.assertEqual((items['F1']['tier'], items['F1']['action']), (1, 'fix'))
        self.assertEqual(items['F1']['key'], 'test-tests|sensitivity|src/f1.py::run')
        self.assertEqual((items['F1|design']['tier'], items['F1|design']['proposals']), (3, [design]))
        self.assertEqual(items['F1|design']['key'], 'test-tests|sensitivity|src/f1.py::run|design')
        self.assertEqual((args['fixes'], len(args['bodies'])), ([items['F1']['n']], 1))

    def test_findings_sharing_a_key_share_one_item(self):
        result = tt_result([finding('F1'), finding('F2', subject='src/F1.py::run', site='src/F1.py:3')],
                           [settled('F1'), settled('F2')], [mutant('F1')])
        _, args, items = self.plan(result)
        self.assertEqual(list(items), ['F1'])
        self.assertEqual(([f['id'] for f in items['F1']['more_findings']], len(items['F1']['proposals'])), (['F2'], 2))
        self.assertEqual(args['fixes'], [])

    def test_report_defects_lose_nothing(self):
        dup = tt_result([finding('F1'), finding('F1', axis='speed', subject='suite')], [settled('F1')])
        _, args, _ = self.plan(dup)
        self.assertEqual(len(args['bodies']), 2)
        merged = tt_result([finding('F1', severity='minor'), finding('F2', subject='src/F1.py::run', severity='blocker')],
                           [settled('F1')])
        _, _, items = self.plan(merged)
        self.assertEqual(items['F1']['priority'], 1)

    def test_mutant_must_be_unique_and_from_a_clean_worker(self):
        two = tt_result([finding('F1')], [settled('F1')], [mutant('F1'), {**mutant('F1'), 'operator': 'boundary-constant'}])
        _, args, items = self.plan(two)
        self.assertEqual(args['fixes'], [])
        self.assertIn('2 surviving mutants', items['F1']['reason'])
        dirty = tt_result([finding('F1')], [settled('F1')], [mutant('F1')])
        dirty['raw']['workers'][0]['integrity_ok'] = False
        _, args, _ = self.plan(dirty)
        self.assertEqual(args['fixes'], [])

    def test_scope_and_serial(self):
        result = tt_result([finding('F1')], [settled('F1')], [mutant('F1')])
        _, args, items = self.plan(result, scope='services/a/')
        self.assertEqual(items['F1']['key'], 'test-tests|services/a|sensitivity|src/f1.py::run')
        self.assertTrue(args['serial'])
        _, args, _ = self.plan({**result, 'parallel_workers': True})
        self.assertFalse(args['serial'])

    def test_run_blocks_stop_every_fix(self):
        base = tt_result([finding('F1')], [settled('F1')], [mutant('F1')])
        cases = {
            'no PR base': dict(pr_base=''),
            'HEAD moved': dict(current='b' * 40),
        }
        for reason, kw in cases.items():
            _, args, items = self.plan(base, **kw)
            self.assertEqual(args['fixes'], [], reason)
            self.assertIn(reason, items['F1']['reason'])
        for reason, result in {'live-tree': {**base, 'mode': 'live-tree'},
                               'uncommitted': {**base, 'raw': {**base['raw'], 'baseline': {'dirty_tree': True}}},
                               'verdict is untrustworthy': {**base, 'report': {**base['report'], 'verdict': 'untrustworthy'}}
                               }.items():
            _, args, items = self.plan(result)
            self.assertEqual(args['fixes'], [], reason)
            self.assertIn(reason, items['F1']['reason'])

    def test_pr_cap(self):
        ids = [f'F{i}' for i in range(1, 6)]
        _, args, items = self.plan(tt_result([finding(i) for i in ids], [settled(i) for i in ids],
                                             [mutant(i) for i in ids]))
        self.assertEqual(len(args['fixes']), plan_mod.PR_CAP)
        self.assertEqual(len(args['bodies']), 5 - plan_mod.PR_CAP)
        self.assertIn('PR cap', items['F5']['reason'])

    def test_aborted_run_is_one_remediation_item(self):
        result = tt_result([finding('F1', axis='reliability')], [settled('F1'), settled('F1')],
                           aborted=True, abort_reason='suite is red at baseline — unauditable')
        _, args, items = self.plan(result)
        self.assertEqual(len(items), 1)
        item = next(iter(items.values()))
        self.assertEqual((item['tier'], item['type'], len(item['proposals'])), (2, 'task', 2))
        self.assertEqual(item['key'], 'test-tests|abort|suite is red at baseline')
        self.assertEqual(args['fixes'], [])

    def test_empty_prs_file_reads_as_no_prs(self):
        with tempfile.NamedTemporaryFile('w', suffix='.json', delete=False) as fh:
            path = fh.name
        self.assertEqual(plan_mod.load(path, []), [])
        os.unlink(path)

    def test_error_result_exits_2(self):
        code, _, _ = self.plan({'error': 'bad args'})
        self.assertEqual(code, 2)
        code, _, _ = self.plan({'summary': 's', 'result': {'error': 'bad args'}})
        self.assertEqual(code, 2)

    def test_stop_refiling_names_every_wontfix_word(self):
        for word in plan_mod.WONTFIX_WORDS:
            self.assertIn(f'"{word}"', plan_mod.STOP_REFILING)
            self.assertTrue(plan_mod.WONTFIX.match(f'{word}: reason'), word)

    def test_reads_the_task_output_file(self):
        result = tt_result([finding('F1')], [settled('F1')], [mutant('F1')])
        _, args, _ = self.plan({'summary': 's', 'agentCount': 9, 'result': result})
        self.assertEqual(args['fixes'], [1])

    def test_dedup(self):
        ids = ('F1', 'F2', 'F3', 'F4', 'F5', 'F6')
        findings = [finding(f) for f in ids]
        result = tt_result(findings, [settled(f) for f in ids], [mutant('F1'), mutant('F5')])
        key = {f: f'test-tests|sensitivity|src/{f.lower()}.py::run' for f in ids}
        label = {f: plan_mod.dedup_label(k) for f, k in key.items()}
        tasks = [
            {'id': 't-open', 'status': 'open', 'labels': ['source:project-auto-work', label['F2']]},
            {'id': 't-wont', 'status': 'closed', 'close_reason': "won't fix: by design",
             'labels': ['source:project-auto-work', label['F3']]},
            {'id': 't-done', 'status': 'closed', 'close_reason': 'shipped in abc',
             'labels': ['source:project-auto-work', label['F4']]},
            {'id': 't-fixed', 'status': 'closed', 'close_reason': 'fixed: invalid input now rejected',
             'labels': ['source:project-auto-work', label['F4']]},
            {'id': 't-foreign', 'status': 'open', 'labels': [label['F4']]},
            {'id': 't-filed', 'status': 'open', 'labels': ['source:project-auto-work', label['F5']]},
            {'id': 't-task', 'status': 'closed', 'type': 'task', 'close_reason': 'decided: keep it',
             'labels': ['source:project-auto-work', label['F6']]},
        ]
        prs = [{'number': 7, 'url': 'https://pr/7', 'state': 'CLOSED', 'body': f'text\ndedup-key: {key["F1"]}\n'},
               {'number': 8, 'url': 'https://pr/8', 'state': 'MERGED', 'body': f'dedup-key: {key["F4"]}\n'}]
        _, args, items = self.plan(result, tasks, prs)
        self.assertEqual((items['F1']['action'], items['F1']['existing']), ('skip', ['https://pr/7']))
        self.assertEqual((items['F2']['action'], items['F2']['existing']), ('note', ['t-open']))
        self.assertEqual(items['F3']['action'], 'skip')
        self.assertEqual((items['F4']['action'], items['F4']['related']), ('file', ['t-done', 't-fixed']))
        self.assertIn('regression', items['F4']['reason'])
        self.assertEqual((items['F5']['action'], items['F5']['existing']), ('fix', ['t-filed']))
        self.assertEqual(items['F6']['action'], 'skip')
        self.assertEqual(args['fixes'], [items['F5']['n']])

    def test_keys_are_stable_across_runs(self):
        a = tt_result([finding('F1', subject='src/a.py::Run ')], [settled('F1')])
        b = tt_result([finding('F9', subject='src/a.py::run', site='src/a.py:99')], [settled('F9')])
        _, _, ia = self.plan(a)
        _, _, ib = self.plan(b)
        self.assertEqual(ia['F1']['label'], ib['F9']['label'])

    def test_items_no_key_matched_go_to_the_match_agent(self):
        result = tt_result([finding('F1'), finding('F2', axis='speed', subject='suite')], [settled('F1')])
        f1_label = plan_mod.dedup_label('test-tests|svc|sensitivity|src/f1.py::run')
        tasks = [{'id': 't-key', 'status': 'open', 'title': 'F1', 'labels': ['source:project-auto-work', f1_label]},
                 {'id': 't-open', 'status': 'open', 'title': 'slow suite', 'type': 'chore',
                  'labels': ['source:project-auto-work', 'dedup:x']},
                 {'id': 't-wontfix', 'status': 'closed', 'close_reason': "won't fix", 'labels': ['source:project-auto-work']},
                 {'id': 't-fixed', 'status': 'closed', 'close_reason': 'fixed', 'type': 'bug', 'labels': ['source:project-auto-work']},
                 {'id': 't-mine', 'status': 'open', 'labels': ['dedup:y']}]
        with tempfile.TemporaryDirectory() as d:
            for name, data in (('result', result), ('tasks', tasks)):
                with open(os.path.join(d, f'{name}.json'), 'w') as fh:
                    json.dump(data, fh)
            out = os.path.join(d, 'plan')
            proc = subprocess.run([sys.executable, os.path.join(BIN, 'triage-plan.py'), '--tool', 'test-tests',
                                   '--result', os.path.join(d, 'result.json'), '--tasks', os.path.join(d, 'tasks.json'),
                                   '--scope', 'svc/', '--out', out], capture_output=True, text=True)
            args = json.loads(proc.stdout)
            with open(os.path.join(out, 'earlier.json')) as fh:
                earlier = {e['id']: e['on_match'] for e in json.load(fh)}
            with open(os.path.join(out, 'plan.json')) as fh:
                context = json.load(fh)['context']
        self.assertEqual(earlier, {'t-open': 'note', 't-wontfix': 'skip'})
        self.assertEqual((args['match'], args['earlier']), (args['bodies'], ['t-open', 't-wontfix']))
        self.assertEqual(context['key_prefix'], 'test-tests|svc|')
        _, args, _ = self.plan(result)
        self.assertEqual(args['match'], [])

    def test_test_app_never_fixes(self):
        result = {'repoRoot': '/repo', 'level': 'ultra', 'scratchDir': '/tmp/s', 'mode': 'worktree',
                  'report': {'verdict': 'rough', 'findings': [
                      {'id': 'F1', 'subject': 'Export: CSV keeps the header row', 'flow_id': 'flow-3', 'severity': 'blocker',
                       'repro_confirmed': 'yes'}],
                      'questions': [{'id': 'Q1', 'title': 'Is CSV required?', 'context': 'c', 'why_unclear': 'w'}],
                      'proposals': [settled('F1')]}}
        _, args, items = self.plan(result, tool='test-app')
        self.assertEqual(args['fixes'], [])
        self.assertEqual((items['F1']['tier'], items['F1']['type'], items['F1']['priority']), (2, 'bug', 1))
        self.assertEqual(items['F1']['key'], 'test-app|export: csv keeps the header row')
        question = items['test-app|question|is csv required?']
        self.assertEqual((question['tier'], question['type']), (2, 'task'))


STUB = """#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$STUB_LOG"
case "$1" in
  create) [[ "$*" == *"--title refuse"* ]] && { echo "missing ## Problem" >&2; exit 1; }
          n=$(wc -l < "$STUB_LOG"); echo "{\\"id\\": \\"stub-$n\\"}" ;;
  comment) echo '{}' ;;
esac
"""


class FileTest(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        stub = os.path.join(self.dir, 'taskmgr')
        with open(stub, 'w') as fh:
            fh.write(STUB)
        os.chmod(stub, os.stat(stub).st_mode | stat.S_IEXEC)
        self.log = os.path.join(self.dir, 'log')
        self.env = {**os.environ, 'PATH': f'{self.dir}:{os.environ["PATH"]}', 'STUB_LOG': self.log}

    def item(self, n, action, **kw):
        return {'n': n, 'key': f'k{n}', 'tier': 2, 'type': 'chore', 'priority': 2, 'reason': 'r',
                'labels': ['source:project-auto-work', f'dedup:{n}'], 'action': action, **kw}

    def run_file(self, items, workflow, bodies=(), earlier=None):
        if earlier is not None:
            with open(os.path.join(self.dir, 'earlier.json'), 'w') as fh:
                json.dump(earlier, fh)
        for n in bodies:
            with open(os.path.join(self.dir, f'body-{n}.md'), 'w') as fh:
                fh.write('## Context\n')
        wf = os.path.join(self.dir, 'wf.json')
        with open(wf, 'w') as fh:
            json.dump(workflow, fh)
        context = {'tool': 'test-tests', 'audited_head': HEAD, 'stop_refiling': plan_mod.STOP_REFILING}
        with open(os.path.join(self.dir, 'plan.json'), 'w') as fh:
            json.dump({'context': context, 'items': items}, fh)
        proc = subprocess.run([sys.executable, os.path.join(BIN, 'triage-file.py'), '--plan-dir', self.dir,
                               '--workflow-result', wf, '--repo-root', '/repo'],
                              capture_output=True, text=True, env=self.env)
        self.stdout = proc.stdout
        with open(os.path.join(self.dir, 'summary.json')) as fh:
            rows = {r['n']: r for r in json.load(fh)}
        calls = []
        if os.path.exists(self.log):
            with open(self.log) as fh:
                calls = fh.read().splitlines()
        return proc.returncode, rows, calls

    def test_every_action(self):
        items = [self.item(1, 'fix', tier=1), self.item(2, 'fix', tier=1), self.item(3, 'file', related=['t-old']),
                 self.item(4, 'note', existing=['t-a']), self.item(5, 'skip', existing=['https://pr/7'])]
        workflow = {'fixes': [{'n': 1, 'status': 'pr', 'url': 'https://pr/9'},
                              {'n': 2, 'status': 'failed', 'reason': 'mutant still survives'}],
                    'bodies': [{'n': 2, 'title': 'Two'}, {'n': 3, 'title': 'Three'}]}
        code, rows, calls = self.run_file(items, {'summary': 's', 'result': workflow}, bodies=(2, 3))
        self.assertEqual(code, 0)
        self.assertEqual((rows[1]['outcome'], rows[1]['ref']), ('pr', 'https://pr/9'))
        self.assertEqual((rows[2]['outcome'], rows[2]['tier']), ('filed', 2))
        self.assertIn('mutant still survives', rows[2]['reason'])
        self.assertEqual(rows[3]['outcome'], 'filed')
        self.assertEqual(rows[4]['outcome'], 'noted')
        self.assertEqual(rows[5]['outcome'], 'skipped')
        creates = [c for c in calls if c.startswith('create')]
        self.assertEqual(len(creates), 2)
        self.assertIn('--related t-old', creates[1])
        self.assertIn('--label source:project-auto-work --label dedup:3', creates[1])
        self.assertTrue(all('-C /repo --json' in c for c in calls))
        self.assertTrue(any(c.startswith('comment add t-a') for c in calls))
        self.assertIn('"not planned"', self.stdout)

    def test_fix_on_a_filed_item_comments_on_it(self):
        items = [self.item(1, 'fix', tier=1, existing=['t-a']), self.item(2, 'fix', tier=1, existing=['t-b'])]
        workflow = {'fixes': [{'n': 1, 'status': 'pr', 'url': 'https://pr/9'}, {'n': 2, 'status': 'failed', 'reason': 'red'}],
                    'bodies': []}
        code, rows, calls = self.run_file(items, workflow)
        self.assertEqual(code, 0)
        self.assertEqual((rows[1]['outcome'], rows[2]['outcome']), ('pr', 'noted'))
        self.assertFalse(rows[1]['comment_failed'])
        self.assertTrue(any(c.startswith('comment add t-a') and 'https://pr/9' in c for c in calls))
        self.assertTrue(any(c.startswith('comment add t-b') and 'red' in c for c in calls))
        self.assertFalse(any(c.startswith('create') for c in calls))

    def test_a_match_by_meaning_comments_or_skips(self):
        items = [self.item(1, 'file', finding={'subject': 'sub: subtracts b from a'}), self.item(2, 'file'),
                 self.item(3, 'file'), self.item(4, 'file')]
        earlier = [{'id': 't-open', 'on_match': 'note'}, {'id': 't-decided', 'on_match': 'skip'}]
        workflow = {'fixes': [], 'bodies': [{'n': 3, 'title': 'Three'}, {'n': 4, 'title': 'Four'}],
                    'matches': [{'n': 1, 'id': 't-open'}, {'n': 2, 'id': 't-decided'}, {'n': 3, 'id': 't-unknown'}]}
        code, rows, calls = self.run_file(items, workflow, bodies=(3, 4), earlier=earlier)
        self.assertEqual(code, 0)
        self.assertEqual((rows[1]['outcome'], rows[1]['ref']), ('noted', 't-open'))
        self.assertTrue(any(c.startswith('comment add t-open') and 'sub: subtracts b from a' in c for c in calls))
        self.assertEqual((rows[2]['outcome'], rows[2]['ref']), ('skipped', 't-decided'))
        self.assertEqual((rows[3]['outcome'], rows[4]['outcome']), ('filed', 'filed'))
        self.assertEqual(len([c for c in calls if c.startswith('create')]), 2)

    def test_table_cells_survive_pipes_and_newlines(self):
        sys.path.insert(0, BIN)
        spec = importlib.util.spec_from_file_location('triage_file', os.path.join(BIN, 'triage-file.py'))
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        row = {'n': 1, 'tier': 2, 'outcome': 'not filed', 'ref': '', 'reason': 'refused:\n{\n "x": 1\n}', 'key': 'a|b|c'}
        line = mod.markdown([row]).splitlines()[2]
        self.assertEqual(line.replace('\\|', '').count('|'), 7)

    def test_missing_body_and_refusal_exit_3(self):
        items = [self.item(1, 'file'), self.item(2, 'file')]
        code, rows, _ = self.run_file(items, {'fixes': [], 'bodies': [{'n': 2, 'title': 'refuse'}]}, bodies=(2,))
        self.assertEqual(code, 3)
        self.assertEqual(rows[1]['outcome'], 'not filed')
        self.assertIn('body agent returned nothing', rows[1]['reason'])
        self.assertIn('missing ## Problem', rows[2]['reason'])


if __name__ == '__main__':
    unittest.main(verbosity=2)
