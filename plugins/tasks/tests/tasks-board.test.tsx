import { expect, test } from 'claude-code/testing'
import type { On, ProcessRunResult, RenderPropsOf } from 'claude-code'

const TERMINAL = { cwd: '/repo', surface: 'terminal', isInteractive: true } as const
const HEADLESS = { cwd: '/repo', surface: null, isInteractive: false } as const
const PANE: RenderPropsOf['Pane'] = {
  title: 'Tasks',
  isFocused: false,
  bodyColumns: 60,
  placement: 'dock',
  scroll: { offset: 0, bodyRows: 20 },
  view: {},
}

const IN_PROGRESS = [{ id: 'rep-1', type: 'task', priority: 2, title: 'Rewrite the guard' }]
const READY = [
  { id: 'rep-2', type: 'bug', priority: 1, title: 'Name fails validation' },
  { id: 'rep-3', type: 'epic', priority: 2, title: 'Ship mods' },
]
const TYPED = {
  command: 'tasks-board',
  args: '',
  origin: { kind: 'composer' },
  presentation: { isFullscreen: true, columns: 160 },
} as const
const BLOCKED = [{ id: 'rep-4', type: 'feature', priority: 3, title: 'Status line', blocked_by: ['rep-1'] }]

function ran(stdout: string, exitCode = 0, stderr = ''): { value: ProcessRunResult } {
  return { value: { exitCode, stdout, stderr, isStdoutTruncated: false, isStderrTruncated: false } }
}

// Stands for the host: answers taskmgr's three views and records the panes opened.
function host(on: On, views: { inProgress: unknown[]; ready: unknown[]; blocked: unknown[] } | Error | string) {
  const seen = { opened: [] as string[] }

  on('process.run', ($, e) => {
    if (views instanceof Error) {
      throw views
    }

    if (typeof views === 'string') {
      return ran('', 1, views)
    }

    const view = e.argv[1] === 'list' ? views.inProgress : e.argv[1] === 'ready' ? views.ready : views.blocked

    return ran(JSON.stringify(view))
  })
  on('ui.open', ($, e) => {
    seen.opened.push(e.id)

    return { value: { isPlaced: true } }
  })
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))

  return seen
}

test('/tasks-board opens the pane and draws the three views', async ($, on) => {
  const seen = host(on, { inProgress: IN_PROGRESS, ready: READY, blocked: BLOCKED })

  await $.session.start(TERMINAL)
  const answer = await $.command.run(TYPED)

  expect(seen.opened).toEqual(['tasks-board'])
  expect(answer.text).toBe('1 in progress, 2 ready, 1 blocked')

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'tasks', surface, component: 'Pane', requestId: 'tasks-board', props: PANE })
    const lines = (await ui.findAll({ type: 'Text' })).map(line => line.text)

    expect(lines).toEqual([
      'In progress (1)',
      'rep-1 P2 task Rewrite the guard',
      'Ready (2)',
      'rep-2 P1 bug Name fails validation',
      'rep-3 P2 epic Ship mods',
      'Blocked (1)',
      'rep-4 P3 feature Status line (blocked by rep-1)',
    ])
    await ui.unmount()
  }
})

test('running /tasks-board again redraws the pane with the new state', async ($, on) => {
  const views = { inProgress: IN_PROGRESS, ready: READY, blocked: BLOCKED }
  host(on, views)

  await $.session.start(TERMINAL)
  await $.command.run(TYPED)
  const ui = await $.ui.mount({
    plugin: 'tasks',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'tasks-board',
    props: PANE,
  })
  views.inProgress = []
  views.blocked = []
  await $.command.run(TYPED)

  expect(await ui.find({ type: 'Text', text: 'In progress (0)' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Blocked (0)' })).toBeDefined()
  expect(await ui.findAll({ type: 'Text', text: 'none' })).toHaveLength(2)
})

test('with no store, /tasks-board prints taskmgr\'s own line and opens no pane', async ($, on) => {
  const seen = host(on, "taskmgr: no .tasks directory found — run 'taskmgr init' to create one")

  await $.session.start(TERMINAL)
  const answer = await $.command.run(TYPED)

  expect(answer.text).toBe("taskmgr: no .tasks directory found — run 'taskmgr init' to create one")
  expect(seen.opened).toEqual([])
})

test('without taskmgr on PATH, /tasks-board says so', async ($, on) => {
  const seen = host(on, new Error('spawn taskmgr ENOENT'))

  await $.session.start(TERMINAL)
  const answer = await $.command.run(TYPED)

  expect(answer.text).toBe('taskmgr is not on PATH')
  expect(seen.opened).toEqual([])
})

test('a headless session gets the three views as text and no pane', async ($, on) => {
  const seen = host(on, { inProgress: IN_PROGRESS, ready: READY, blocked: BLOCKED })

  await $.session.start(HEADLESS)
  const answer = await $.command.run(TYPED)

  expect(answer.text).toBe(
    [
      'In progress (1)',
      '  rep-1 P2 task Rewrite the guard',
      'Ready (2)',
      '  rep-2 P1 bug Name fails validation',
      '  rep-3 P2 epic Ship mods',
      'Blocked (1)',
      '  rep-4 P3 feature Status line (blocked by rep-1)',
    ].join('\n'),
  )
  expect(seen.opened).toEqual([])
})
