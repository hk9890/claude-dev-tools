import { expect, test } from 'claude-code/testing'
import type { On, ProcessRunResult } from 'claude-code'

// A release outlives the session end only in a session of its own with its output closed.
const DETACHED_RELEASE = 'exec setsid -f werft --json release "$1" </dev/null >/dev/null 2>&1'

const END = { reason: 'prompt_input_exit', sessionId: 's1', resume: { id: 's1' } } as const

const LEASES = [
  { id: 'a1', owner: 'claude-s1' },
  { id: 'b2', owner: 'claude-s2' },
  { id: 'c3', owner: 'claude-s1' },
  { id: 'd4', owner: 'hans' },
]

function ran(exitCode: number, stdout: string): { value: ProcessRunResult } {
  return { value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
}

// Stands for the host: answers `werft --json leases` with `listed`, records each release started
// and each debug line, and ends the session. A werft that is not on PATH is `{ isInstalled: false }`.
function host(on: On, { listed = ran(0, JSON.stringify(LEASES)), isInstalled = true } = {}) {
  const seen = { released: [] as string[], logged: [] as string[], ended: [] as string[] }

  on('process.run', ($, e) => {
    if (!isInstalled) {
      return { deny: 'spawn werft ENOENT' }
    }

    if (e.argv[0] === 'sh') {
      expect(e.argv.slice(0, 4)).toEqual(['sh', '-c', DETACHED_RELEASE, 'sh'])
      seen.released.push(String(e.argv[4]))

      return ran(0, '')
    }

    expect(e.argv).toEqual(['werft', '--json', 'leases'])

    return listed
  })
  on('ui.log', ($, e) => {
    seen.logged.push(e.text)

    return { value: undefined }
  })
  on('session.end', ($, e) => {
    seen.ended.push(e.sessionId)

    return { sessionId: e.sessionId }
  })

  return seen
}

test('the session end releases each lease of this session and no other', async ($, on) => {
  const seen = host(on)

  await $.session.end(END)

  expect(seen.released).toEqual(['a1', 'c3'])
  expect(seen.ended).toEqual(['s1'])
})

test('a /clear releases the leases of the session it ends', async ($, on) => {
  const seen = host(on)

  await $.session.end({ ...END, reason: 'clear', sessionId: 's2' })

  expect(seen.released).toEqual(['b2'])
})

test('a session with no lease releases nothing', async ($, on) => {
  const seen = host(on, { listed: ran(0, '[]') })

  await $.session.end(END)

  expect(seen.released).toEqual([])
  expect(seen.logged).toEqual([])
  expect(seen.ended).toEqual(['s1'])
})

test('a failed werft call releases nothing and the session still ends', async ($, on) => {
  const seen = host(on, { listed: ran(1, '{"error": {"kind": "failed", "message": "libvirt"}}') })

  await $.session.end(END)

  expect(seen.released).toEqual([])
  expect(seen.ended).toEqual(['s1'])
})

test('without werft the session ends and the debug log says why', async ($, on) => {
  const seen = host(on, { isInstalled: false })

  await $.session.end(END)

  expect(seen.released).toEqual([])
  expect(seen.logged).toHaveLength(1)
  expect(seen.logged[0]).toContain('spawn werft ENOENT')
  expect(seen.ended).toEqual(['s1'])
})

test('a failed werft call releases nothing, also where it printed leases', async ($, on) => {
  const seen = host(on, { listed: ran(1, JSON.stringify(LEASES)) })

  await $.session.end(END)

  expect(seen.released).toEqual([])
  expect(seen.ended).toEqual(['s1'])
})

test('output that is not JSON releases nothing and the debug log says why', async ($, on) => {
  const seen = host(on, { listed: ran(0, 'not json') })

  await $.session.end(END)

  expect(seen.released).toEqual([])
  expect(seen.logged).toHaveLength(1)
  expect(seen.ended).toEqual(['s1'])
})
