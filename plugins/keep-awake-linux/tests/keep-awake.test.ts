import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const IDLE_MS = 30 * 60_000
const TURN_END = { answer: '', durationMs: 1, isAborted: false, reason: 'answer' } as const

// Stands for the host: records each inhibitor started and each one ended. `exit` ends the running
// child as its own exit would; a `systemd-inhibit` that cannot start is `host(on, { canStart: false })`.
function host(on: On, { canStart = true } = {}) {
  const seen = {
    started: [] as (readonly string[])[],
    ended: 0,
    status: [] as (string | undefined)[],
    logged: [] as string[],
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
  on('session.id', () => ({ value: 's1' }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('session.end', ($, e) => ({ sessionId: e.sessionId }))
  on('tool.call', () => ({ result: 'ok' }))

  return seen
}

test('the first turn starts one inhibitor and shows it in the status line', async ($, on) => {
  const clock = mock.clock(on)
  const seen = host(on)

  await $.turn.start({ text: 'go', turnId: 't1' })
  await clock.settle()

  expect(seen.started).toHaveLength(1)
  expect(seen.started[0]?.slice(0, 3)).toEqual(['systemd-inhibit', '--what=idle:sleep', '--who=claude-keep-awake'])
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
  expect(seen.status.at(-1)).toBeUndefined()
})

test('a tool call after the turn, from a background agent, keeps the inhibitor one more period', async ($, on) => {
  const clock = mock.clock(on)
  const seen = host(on)

  await $.turn.start({ text: 'go', turnId: 't1' })
  await $.turn.complete({ ...TURN_END, turnId: 't1' })
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  await clock.advance(IDLE_MS)
  expect(seen.ended).toBe(0)

  await clock.advance(IDLE_MS)
  expect(seen.ended).toBe(1)
})

test('a subagent turn that completes does not start the idle timer', async ($, on) => {
  const clock = mock.clock(on)
  const seen = host(on)

  await $.turn.start({ text: 'go', turnId: 't1' })
  await $.turn.complete({ ...TURN_END, turnId: 'a1', agentId: 'agent-1' })
  await clock.advance(IDLE_MS * 3)

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
  await clock.settle()

  expect(seen.started).toHaveLength(2)
  expect(seen.ended).toBe(1)
  expect(seen.status.at(-1)).toBe('sleep blocked')
})

test('the inhibitor is renewed when its lease ends during a long turn', async ($, on) => {
  const clock = mock.clock(on)
  const seen = host(on)

  await $.turn.start({ text: 'go', turnId: 't1' })
  await clock.settle()
  seen.exit(0)
  await clock.settle()

  expect(seen.started).toHaveLength(2)
  expect(seen.status).toEqual(['sleep blocked'])
})

test('an inhibitor that exits with an error is not started again', async ($, on) => {
  const clock = mock.clock(on)
  const seen = host(on)

  await $.turn.start({ text: 'go', turnId: 't1' })
  await clock.settle()
  seen.exit(1)
  await clock.settle()

  expect(seen.started).toHaveLength(1)
  expect(seen.status).toEqual(['sleep blocked', undefined])
  expect(seen.logged).toEqual(['inhibitor lost: Error: systemd-inhibit exited with 1'])
})

test('without systemd-inhibit the mod does nothing and says why in the debug log', async ($, on) => {
  const clock = mock.clock(on)
  const seen = host(on, { canStart: false })

  await $.turn.start({ text: 'go', turnId: 't1' })
  await clock.settle()

  expect(seen.started).toEqual([])
  expect(seen.status.at(-1)).toBeUndefined()
  expect(seen.logged).toHaveLength(1)
  expect(seen.logged[0]).toContain('inhibitor lost')
})
