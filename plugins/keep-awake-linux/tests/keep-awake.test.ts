import { expect, mock, test } from 'claude-code/testing'
import type { On, ProcessRunResult, RenderPropsOf, RenderSurface } from 'claude-code'

const IDLE_MS = 30 * 60_000
const STARTUP_MS = 1000
const TEN_MINUTES = 10 * 60_000
const TURN_END = { answer: '', durationMs: 1, isAborted: false, reason: 'answer' } as const

// Stands for the host: records each inhibitor started and each one ended. `exit` ends the running
// child as its own exit would; a `systemd-inhibit` that cannot start is `host(on, { canStart: false })`.
function host(on: On, { canStart = true } = {}) {
  const seen = {
    started: [] as (readonly string[])[],
    ended: 0,
    logged: [] as string[],
    toasts: [] as string[],
    exit: (code: number) => {},
  }

  on('process.spawn', async function* ($, e, next) {
    if (!canStart) {
      throw new Error('spawn systemd-inhibit ENOENT')
    }

    seen.started.push(e.argv)
    try {
      const code = await new Promise<number>((resolve, reject) => {
        seen.exit = resolve
        next.signal.addEventListener('abort', reject)
      })

      return { value: { code, signal: null } }
    } finally {
      seen.ended += 1
    }
  })
  on('ui.log', ($, e) => {
    seen.logged.push(e.text)

    return { value: undefined }
  })
  on('ui.toast', ($, e) => {
    seen.toasts.push(e.text)

    return { value: undefined }
  })
  on('session.id', () => ({ value: 's1' }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('session.end', ($, e) => ({ sessionId: e.sessionId }))
  on('tool.call', () => ({ result: 'ok' }))

  return seen
}

test('the first turn starts one inhibitor', async ($, on) => {
  const clock = mock.clock(on)
  const seen = host(on)

  await $.turn.start({ text: 'go', turnId: 't1' })
  await clock.settle()

  expect(seen.started).toHaveLength(1)
  expect(seen.started[0]?.slice(0, 3)).toEqual(['systemd-inhibit', '--what=idle:sleep', '--who=claude-keep-awake'])
})

test('a second turn starts no second inhibitor', async ($, on) => {
  const clock = mock.clock(on)
  const seen = host(on)

  await $.turn.start({ text: 'go', turnId: 't1' })
  await $.turn.complete({ ...TURN_END, turnId: 't1' })
  await $.turn.start({ text: 'again', turnId: 't2' })
  await clock.settle()

  expect(seen.started).toHaveLength(1)
  expect(seen.ended).toBe(0)
})

test('the inhibitor ends once the session is idle for the configured time', async ($, on) => {
  const clock = mock.clock(on)
  const seen = host(on)

  await $.turn.start({ text: 'go', turnId: 't1' })
  await $.turn.complete({ ...TURN_END, turnId: 't1' })
  await clock.advance(IDLE_MS - 1)
  expect(seen.ended).toBe(0)

  await clock.advance(1)
  expect(seen.ended).toBe(1)
})

test('a turn that waits on the person releases the inhibitor after the idle time', async ($, on) => {
  const clock = mock.clock(on)
  const seen = host(on)

  await $.turn.start({ text: 'go', turnId: 't1' })
  await clock.advance(IDLE_MS - 1)
  expect(seen.ended).toBe(0)

  await clock.advance(1)
  expect(seen.ended).toBe(1)

  await clock.advance(IDLE_MS * 20)
  expect(seen.started).toHaveLength(1)
})

test('a turn with a tool call every 10 minutes keeps one inhibitor for 2 hours', async ($, on) => {
  const clock = mock.clock(on)
  const seen = host(on)

  await $.turn.start({ text: 'go', turnId: 't1' })

  for (let minutes = 0; minutes < 120; minutes += 10) {
    await $.tool.call({ tool: 'Bash', command: 'ls' })
    await clock.advance(TEN_MINUTES)
  }

  expect(seen.started).toHaveLength(1)
  expect(seen.ended).toBe(0)
})

test('a tool call after the turn starts the idle time again', async ($, on) => {
  const clock = mock.clock(on)
  const seen = host(on)

  await $.turn.start({ text: 'go', turnId: 't1' })
  await $.turn.complete({ ...TURN_END, turnId: 't1' })
  await clock.advance(TEN_MINUTES)
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  await clock.advance(IDLE_MS - 1)
  expect(seen.ended).toBe(0)

  await clock.advance(1)
  expect(seen.ended).toBe(1)
})

test('a tool call after the idle release starts one fresh inhibitor', async ($, on) => {
  const clock = mock.clock(on)
  const seen = host(on)

  await $.turn.start({ text: 'go', turnId: 't1' })
  await $.turn.complete({ ...TURN_END, turnId: 't1' })
  await clock.advance(IDLE_MS)
  expect(seen.ended).toBe(1)

  await $.tool.call({ tool: 'Bash', command: 'ls' })
  await clock.advance(STARTUP_MS)

  expect(seen.started).toHaveLength(2)
  expect(seen.ended).toBe(1)
})

// A background agent works on after the main turn ended: its tool calls are the only events.
test('tool calls with no turn open keep one inhibitor for 2 hours', async ($, on) => {
  const clock = mock.clock(on)
  const seen = host(on)

  for (let minutes = 0; minutes < 120; minutes += 10) {
    await $.tool.call({ tool: 'Bash', command: 'ls' })
    await clock.advance(TEN_MINUTES)
  }

  expect(seen.started).toHaveLength(1)
  expect(seen.ended).toBe(0)
})

test('the session end ends the inhibitor at once', async ($, on) => {
  const clock = mock.clock(on)
  const seen = host(on)

  await $.turn.start({ text: 'go', turnId: 't1' })
  await clock.settle()
  await $.session.end({ reason: 'prompt_input_exit', sessionId: 's1', resume: { id: 's1' } })
  await clock.settle()

  expect(seen.ended).toBe(1)
})

test('a custom idle time is honoured', { options: { idleMinutes: 1 } }, async ($, on) => {
  const clock = mock.clock(on)
  const seen = host(on)

  await $.turn.start({ text: 'go', turnId: 't1' })
  await $.turn.complete({ ...TURN_END, turnId: 't1' })
  await clock.advance(60_000)

  expect(seen.ended).toBe(1)
})

test('a turn after the idle release starts one fresh inhibitor', async ($, on) => {
  const clock = mock.clock(on)
  const seen = host(on)

  await $.turn.start({ text: 'go', turnId: 't1' })
  await $.turn.complete({ ...TURN_END, turnId: 't1' })
  await clock.advance(IDLE_MS)
  await $.turn.start({ text: 'again', turnId: 't2' })
  await clock.advance(STARTUP_MS)

  expect(seen.started).toHaveLength(2)
  expect(seen.ended).toBe(1)
})

test('the inhibitor is renewed when its lease ends during a long turn', async ($, on) => {
  const clock = mock.clock(on)
  const seen = host(on)

  await $.turn.start({ text: 'go', turnId: 't1' })
  await clock.advance(STARTUP_MS)
  seen.exit(0)
  await clock.settle()

  expect(seen.started).toHaveLength(2)
})

test('an inhibitor that fails after it started is tried again on the next activity', async ($, on) => {
  const clock = mock.clock(on)
  const seen = host(on)

  await $.turn.start({ text: 'go', turnId: 't1' })
  await clock.advance(STARTUP_MS)
  seen.exit(1)
  await clock.settle()

  expect(seen.started).toHaveLength(1)
  expect(seen.logged).toEqual(['inhibitor lost: Error: systemd-inhibit exited with 1'])
  expect(seen.toasts).toEqual([])

  await $.tool.call({ tool: 'Bash', command: 'ls' })
  await clock.settle()
  expect(seen.started).toHaveLength(2)
})

test('an inhibitor that logind refuses at once is not tried again', async ($, on) => {
  const clock = mock.clock(on)
  const seen = host(on)

  await $.turn.start({ text: 'go', turnId: 't1' })
  await clock.settle()
  seen.exit(1)
  await clock.settle()
  await $.turn.start({ text: 'again', turnId: 't2' })
  await clock.advance(STARTUP_MS)

  expect(seen.started).toHaveLength(1)
  expect(seen.toasts).toEqual(['sleep is not blocked: systemd-inhibit exited with 1'])
})

test('without systemd-inhibit the mod says so once', async ($, on) => {
  const clock = mock.clock(on)
  const seen = host(on, { canStart: false })

  await $.turn.start({ text: 'go', turnId: 't1' })
  await clock.advance(STARTUP_MS)
  await $.turn.complete({ ...TURN_END, turnId: 't1' })
  await $.turn.start({ text: 'again', turnId: 't2' })
  await clock.advance(STARTUP_MS)

  expect(seen.started).toEqual([])
  expect(seen.logged).toHaveLength(1)
  expect(seen.logged[0]).toContain('inhibitor lost')
  expect(seen.toasts).toHaveLength(1)
  expect(seen.toasts[0]).toMatch(/^sleep is not blocked: .+/)
})

const TERMINAL = { cwd: '/repo', surface: 'terminal', isInteractive: true } as const
const HEADLESS = { cwd: '/repo', surface: null, isInteractive: false } as const
const REFRESH_MS = 5000
const PANEL = {
  plugin: 'keep-awake-linux',
  surface: 'terminal',
  component: 'Pane',
  requestId: 'keep-awake-panel',
  props: {
    title: 'Keep awake',
    isFocused: false,
    bodyColumns: 80,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  } satisfies RenderPropsOf['Pane'],
} as const
const TYPED = {
  command: 'keep-awake-panel',
  args: '',
  origin: { kind: 'composer' },
  presentation: { isFullscreen: true, columns: 160 },
} as const

const INHIBIT = 'systemd-inhibit --what=idle:sleep --who=claude-keep-awake'
const CHILDREN = [
  `  101   11    97 ${INHIBIT} --why=Claude session s1 --mode=block sleep 1800`,
  `  102 2221  1509 ${INHIBIT} --why=Claude session 36eed69b-7898 --mode=block sleep 1800`,
  '  103   12    40 systemd-inhibit --who=someone-else sleep 60',
]
const PARENTS = ['   11 claude', ' 2221 systemd']
const TABLE = [
  'VERDICT    SESSION    PID      PARENT    AGE',
  'healthy    s1*        101      claude    01:37',
  'orphan     36eed69b   102      systemd   25:09',
  '* this session',
]

function ran(lines: string[]): { value: ProcessRunResult } {
  return {
    value: {
      exitCode: lines.length === 0 ? 1 : 0,
      stdout: lines.join('\n'),
      stderr: '',
      isStdoutTruncated: false,
      isStderrTruncated: false,
    },
  }
}

// Stands for the host of the panel: answers `ps` from `processes`, which a test changes in place,
// and keeps the panes open in `seen.opened`, which a test empties as the person closing the pane.
function panelHost(on: On, processes: { children: string[]; parents: string[] }, { surfaces = ['terminal'] as RenderSurface[] } = {}) {
  const seen = { opened: [] as string[], psRuns: 0 }

  on('process.run', ($, e) => {
    seen.psRuns += 1

    return ran(e.argv[1] === '-C' ? processes.children : processes.parents)
  })
  on('ui.open', ($, e) => {
    seen.opened.push(e.id)

    return { value: { isPlaced: true } }
  })
  on('ui.panes', () => ({
    value: seen.opened.map(id => ({ id, title: id, isShown: true, isFocused: false, isPlaced: true })),
  }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.surfaces', () => ({ value: surfaces }))
  on('session.id', () => ({ value: 's1' }))

  return seen
}

test('/keep-awake-panel opens the pane and draws one row for each inhibitor', async ($, on) => {
  mock.clock(on)
  const seen = panelHost(on, { children: CHILDREN, parents: PARENTS })

  await $.session.start(TERMINAL)
  const answer = await $.command.run(TYPED)
  const ui = await $.ui.mount(PANEL)

  expect(seen.opened).toEqual(['keep-awake-panel'])
  expect(answer.text).toBe('2 held, 1 not healthy')
  expect((await ui.findAll({ type: 'Text' })).map(line => line.text)).toEqual(TABLE)
})

test('two inhibitors of one session with a claude parent are both a duplicate', async ($, on) => {
  mock.clock(on)
  panelHost(on, {
    children: [
      `  101   11    97 ${INHIBIT} --why=Claude session s1 --mode=block sleep 1800`,
      `  104   11     5 ${INHIBIT} --why=Claude session s1 --mode=block sleep 1800`,
    ],
    parents: PARENTS,
  })

  await $.session.start(TERMINAL)
  const answer = await $.command.run(TYPED)

  expect(answer.text).toBe('2 held, 2 not healthy')
})

test('the open pane follows the inhibitors as they change', async ($, on) => {
  const clock = mock.clock(on)
  const processes = { children: CHILDREN, parents: PARENTS }
  panelHost(on, processes)

  await $.session.start(TERMINAL)
  await $.command.run(TYPED)
  const ui = await $.ui.mount(PANEL)
  processes.children = []
  await clock.advance(REFRESH_MS)

  expect((await ui.findAll({ type: 'Text' })).map(line => line.text)).toEqual(['No inhibitor is held.'])
})

test('a closed pane reads the inhibitors no more', async ($, on) => {
  const clock = mock.clock(on)
  const seen = panelHost(on, { children: CHILDREN, parents: PARENTS })

  await $.session.start(TERMINAL)
  await $.command.run(TYPED)
  const psRuns = seen.psRuns
  seen.opened = []
  await clock.advance(REFRESH_MS * 3)

  expect(seen.psRuns).toBe(psRuns)
})

test('a headless session gets the inhibitors as text and no pane', async ($, on) => {
  mock.clock(on)
  const seen = panelHost(on, { children: CHILDREN, parents: PARENTS }, { surfaces: [] })

  await $.session.start(HEADLESS)
  const answer = await $.command.run(TYPED)

  expect(answer.text).toBe(TABLE.join('\n'))
  expect(seen.opened).toEqual([])
})
