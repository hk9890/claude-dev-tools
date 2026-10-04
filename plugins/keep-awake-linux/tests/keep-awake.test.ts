import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

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
    status: [] as (string | undefined)[],
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
  on('ui.status', ($, e) => {
    seen.status.push(e.text)

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

test('the first turn starts one inhibitor and shows it once the child has started', async ($, on) => {
  const clock = mock.clock(on)
  const seen = host(on)

  await $.turn.start({ text: 'go', turnId: 't1' })
  await clock.settle()

  expect(seen.started).toHaveLength(1)
  expect(seen.started[0]?.slice(0, 3)).toEqual(['systemd-inhibit', '--what=idle:sleep', '--who=claude-keep-awake'])
  expect(seen.status).toEqual([])

  await clock.advance(STARTUP_MS)
  expect(seen.status).toEqual(['sleep blocked'])
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
  expect(seen.status).toEqual(['sleep blocked', undefined])
})

test('a turn that waits on the person releases the inhibitor after the idle time', async ($, on) => {
  const clock = mock.clock(on)
  const seen = host(on)

  await $.turn.start({ text: 'go', turnId: 't1' })
  await clock.advance(IDLE_MS - 1)
  expect(seen.ended).toBe(0)

  await clock.advance(1)
  expect(seen.ended).toBe(1)
  expect(seen.status.at(-1)).toBeUndefined()

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
  expect(seen.status.at(-1)).toBe('sleep blocked')
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
  expect(seen.status.at(-1)).toBe('sleep blocked')
})

test('the inhibitor is renewed when its lease ends during a long turn', async ($, on) => {
  const clock = mock.clock(on)
  const seen = host(on)

  await $.turn.start({ text: 'go', turnId: 't1' })
  await clock.advance(STARTUP_MS)
  seen.exit(0)
  await clock.settle()

  expect(seen.started).toHaveLength(2)
  expect(seen.status).toEqual(['sleep blocked'])
})

test('an inhibitor that fails after it started is tried again on the next activity', async ($, on) => {
  const clock = mock.clock(on)
  const seen = host(on)

  await $.turn.start({ text: 'go', turnId: 't1' })
  await clock.advance(STARTUP_MS)
  seen.exit(1)
  await clock.settle()

  expect(seen.started).toHaveLength(1)
  expect(seen.status).toEqual(['sleep blocked', undefined])
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
  expect(seen.status).toEqual([])
  expect(seen.toasts).toEqual(['sleep is not blocked: systemd-inhibit exited with 1'])
})

// The session ends and the next turn starts before the first inhibitor's loop saw its child end.
test('an inhibitor that takes over and fails at once clears the status of the one before', async ($, on) => {
  const clock = mock.clock(on)
  const seen = host(on)

  await $.turn.start({ text: 'go', turnId: 't1' })
  await clock.advance(STARTUP_MS)
  await Promise.all([
    $.session.end({ reason: 'prompt_input_exit', sessionId: 's1', resume: { id: 's1' } }),
    $.turn.start({ text: 'again', turnId: 't2' }),
  ])
  await clock.settle()
  seen.exit(1)
  await clock.advance(STARTUP_MS)

  expect(seen.started).toHaveLength(2)
  expect(seen.status).toEqual(['sleep blocked', undefined])
  expect(seen.toasts).toEqual(['sleep is not blocked: systemd-inhibit exited with 1'])
})

test('without systemd-inhibit the mod never shows sleep as blocked and says so once', async ($, on) => {
  const clock = mock.clock(on)
  const seen = host(on, { canStart: false })

  await $.turn.start({ text: 'go', turnId: 't1' })
  await clock.advance(STARTUP_MS)
  await $.turn.complete({ ...TURN_END, turnId: 't1' })
  await $.turn.start({ text: 'again', turnId: 't2' })
  await clock.advance(STARTUP_MS)

  expect(seen.started).toEqual([])
  expect(seen.status).toEqual([])
  expect(seen.logged).toHaveLength(1)
  expect(seen.logged[0]).toContain('inhibitor lost')
  expect(seen.toasts).toHaveLength(1)
  expect(seen.toasts[0]).toMatch(/^sleep is not blocked: .+/)
})
