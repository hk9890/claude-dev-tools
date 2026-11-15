import { expect, test } from 'claude-code/testing'
import type { On, ProcessRunResult, ToolCheckResult } from 'claude-code'

// The release outlives the session end only in a session of its own with its output closed.
const DETACHED_RELEASE = `exec setsid -f werft --json release --owner "$1" </dev/null >/dev/null 2>&1`

const END = { reason: 'prompt_input_exit', sessionId: 's1', resume: { id: 's1' } } as const

function ran(exitCode: number, stdout: string): { value: ProcessRunResult } {
  return { value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
}

// Stands for the host: records the owner of each release started and each debug line, and ends
// the session. A host with no sh to spawn is `{ isInstalled: false }`, a host whose `sh` cannot
// start the detached release (no setsid) is `{ releaseExit: 127 }`.
function host(on: On, { isInstalled = true, releaseExit = 0 } = {}) {
  const seen = { released: [] as string[], logged: [] as string[], ended: [] as string[] }

  on('process.run', ($, e) => {
    if (!isInstalled) {
      return { deny: 'spawn sh ENOENT' }
    }

    expect(e.init?.cwd).toBe('/')
    expect(e.argv.slice(0, 4)).toEqual(['sh', '-c', DETACHED_RELEASE, 'sh'])
    seen.released.push(...e.argv.slice(4))

    return ran(releaseExit, '')
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

test('the session end releases the leases of this session by its owner', async ($, on) => {
  const seen = host(on)

  await $.session.end(END)

  expect(seen.released).toEqual(['claude-s1'])
  expect(seen.logged).toEqual([])
  expect(seen.ended).toEqual(['s1'])
})

test('a /clear releases the leases of the session it ends', async ($, on) => {
  const seen = host(on)

  await $.session.end({ reason: 'clear', sessionId: 's2', resume: { id: 's2' } })

  expect(seen.released).toEqual(['claude-s2'])
})

test('a release that cannot spawn leaves the debug log a line and the session still ends', async ($, on) => {
  const seen = host(on, { isInstalled: false })

  await $.session.end(END)

  expect(seen.released).toEqual([])
  expect(seen.logged).toHaveLength(1)
  expect(seen.logged[0]).toContain('spawn sh ENOENT')
  expect(seen.ended).toEqual(['s1'])
})

test('a release that cannot start names setsid in the debug log', async ($, on) => {
  const seen = host(on, { releaseExit: 127 })

  await $.session.end(END)

  expect(seen.logged).toEqual(['werft: no lease released at the session end: Error: the release did not start (exit 127): is setsid -f on PATH?'])
  expect(seen.ended).toEqual(['s1'])
})

const C = '/home/u/.local/state/werft/leases/ab12cd/ssh_config'

// Stands for the engine and the host: `verdict` on every call, and `werft --json leases` lists
// the one live lease ab12cd with the ssh_config C.
function engine(on: On, verdict: ToolCheckResult) {
  on('tool.check', () => verdict)
  on('process.run', ($, e) => {
    expect(e.argv).toEqual(['werft', '--json', 'leases'])

    return ran(0, JSON.stringify([{ id: 'ab12cd', owner: 'claude-s1', ssh_config: C }]))
  })
}

const ASK: ToolCheckResult = { decision: 'ask' }

test('the werft:werft skill loads without a question', async ($, on) => {
  engine(on, ASK)

  const verdict = await $.tool.check({ tool: 'Skill', input: { skill: 'werft:werft' } })

  expect(verdict.decision).toBe('allow')
})

test('a skill of another source named werft keeps its question', async ($, on) => {
  engine(on, ASK)

  const verdict = await $.tool.check({ tool: 'Skill', input: { skill: 'werft' } })

  expect(verdict.decision).toBe('ask')
})

test('an ask rule of the user on the werft skill stands', async ($, on) => {
  engine(on, { decision: 'ask', rule: 'Skill(werft:werft)' })

  const verdict = await $.tool.check({ tool: 'Skill', input: { skill: 'werft:werft' } })

  expect(verdict.decision).toBe('ask')
})

test('a deny rule on the werft skill stands', async ($, on) => {
  engine(on, { decision: 'deny' })

  const verdict = await $.tool.check({ tool: 'Skill', input: { skill: 'werft:werft' } })

  expect(verdict.decision).toBe('deny')
})

test('another skill keeps its question', async ($, on) => {
  engine(on, ASK)

  const verdict = await $.tool.check({ tool: 'Skill', input: { skill: 'revier:revier' } })

  expect(verdict.decision).toBe('ask')
})

// The forms of the werft guide, as an agent writes them.
const ALLOWED = [
  'werft --json images',
  'werft --json leases',
  'werft --json lease ubuntu-26-04 --tier plain --owner claude-s1 --for 1h',
  'werft --json extend ab12cd --for 2h',
  'werft --json release ab12cd',
  'werft --json release --owner claude-s1',
  'werft --json reap',
  'werft release ab12cd',
  'werft guide',
  'werft help lease',
  `ssh -F ${C} ab12cd 'uname -a'`,
  `ssh -F ${C} ab12cd 'sudo -n apt-get update && sudo -n apt-get install -y curl'`,
  `ssh -F ${C} ab12cd '$SHELL -ic "mise ls"'`,
  `ssh -F ${C} ab12cd 'nohup python3 -m http.server 8080 </dev/null >/dev/null 2>&1 &'`,
  `ssh -F ${C} ab12cd 'python3 --version'`,
  `ssh -F ${C} -f -N -o ExitOnForwardFailure=yes -L 18080:localhost:8080 ab12cd`,
  `scp -F ${C} ./file ab12cd:dst/`,
  `scp -F ${C} -r src ab12cd:src`,
  `tar -C ./dir -cf - . | ssh -F ${C} ab12cd 'mkdir -p src && tar -C src -xf -'`,
  `tar -C dir -cf - . | ssh -F ${C} ab12cd 'mkdir -p src && tar -C src -xf -'`,
]

// Each one runs on this host outside the guide's forms, so its question stands.
const ASKED = [
  'ls',
  'werft start build-vm',
  'werft --json start build-vm',
  'werft --json reset --yes build-vm',
  'werft --json images --prune',
  'werft --json images --prune --yes',
  'werft --json images --prune=true',
  'werft --json images -prune',
  'werft --json images -yes',
  'werft --json lease ubuntu-26-04 --owner claude-s1 --view',
  `tar -C . -cf - -I./prog | ssh -F ${C} ab12cd 'cat'`,
  `tar -C -Iprog -cf - . | ssh -F ${C} ab12cd 'cat'`,
  `scp -F ${C} -S./prog ab12cd:x`,
  `scp -F ${C} -oProxyCommand=sh ab12cd:x`,
  `scp -F ${C} host:x ab12cd:y`,
  'werft --json',
  `ssh -F /home/u/proj/werft/leases/ab12cd/ssh_config ab12cd 'x'`,
  `ssh -F /home/u/.local/state/werft/leases/../../../proj/werft/leases/ab12cd/ssh_config ab12cd 'x'`,
  `ssh -F /home/u/.local/state/werft/leases/zz99zz/ssh_config zz99zz 'x'`,
  `ssh -F ${C} ab12cd -R 2222:localhost:22`,
  `scp -F ${C} ab12cd:src/result.log .`,
  `scp -F ${C} ab12cd:p .claude/settings.local.json`,
  `scp -F ${C} /home/u/.ssh/id_ed25519 ab12cd:k`,
  `tar -C / -cf - home/u/.ssh | ssh -F ${C} ab12cd 'cat'`,
  `tar -C .. -cf - . | ssh -F ${C} ab12cd 'cat'`,
  `tar -C ./dir -cf - ../.. | ssh -F ${C} ab12cd 'cat'`,
  'werft --json leases; rm -rf /tmp/zz',
  'werft --json release $(cat ids)',
  `ssh -F /tmp/evil_config ab12cd 'x'`,
  `ssh -F ${C} other 'x'`,
  `ssh -F ${C} ab12cd 'x'; rm -rf /tmp/zz`,
  `ssh -F ${C} ab12cd 'x' && rm -rf /tmp/zz`,
  `ssh -F ${C} ab12cd 'x' > /tmp/out`,
  `ssh -F ${C} ab12cd "$(rm -rf /tmp/zz)"`,
  `ssh -F ${C} ab12cd'x'`,
  `ssh -F ${C} -o ProxyCommand=sh ab12cd 'x'`,
  `ssh -F ${C} ab12cd -o ProxyCommand=sh 'x'`,
  `ssh -F ${C} ab12cd '-oProxyCommand=sh' 'x'`,
  `ssh -F ${C} ab12cd python3 --version`,
  'werft --json leases\nrm -rf build',
  `ssh -F ${C} ab12cd 'x'\nrm -rf build`,
  `ssh -F ${C} ab12cd 'x' | sh`,
  `scp -F ${C} ab12cd:x /home/u/.bashrc`,
  `scp -F ${C} ab12cd:x ../outside`,
  `scp -F ${C} ./a ./b`,
  `scp -F /tmp/x ab12cd:b .`,
  'tar -C / -xf -',
  `tar -C ./dir -cf - . | sh`,
  `tar -C ./dir -cf - . | ssh -F /tmp/evil ab12cd 'x'`,
]

for (const command of ALLOWED) {
  test(`allows: ${command}`, async ($, on) => {
    engine(on, ASK)

    const verdict = await $.tool.check({ tool: 'Bash', input: { command } })

    expect(verdict.decision).toBe('allow')
  })
}

for (const command of ASKED) {
  test(`keeps the question: ${command}`, async ($, on) => {
    engine(on, ASK)

    const verdict = await $.tool.check({ tool: 'Bash', input: { command } })

    expect(verdict.decision).toBe('ask')
  })
}

test('a deny rule on a werft command stands', async ($, on) => {
  engine(on, { decision: 'deny' })

  const verdict = await $.tool.check({ tool: 'Bash', input: { command: 'werft --json leases' } })

  expect(verdict.decision).toBe('deny')
})

for (const verdict of [{ decision: 'ask', rule: 'Bash(ssh:*)' }, { decision: 'ask', hook: 'PreToolUse' }] as ToolCheckResult[]) {
  test(`the user's own ask stands: ${JSON.stringify(verdict)}`, async ($, on) => {
    engine(on, verdict)

    const answer = await $.tool.check({ tool: 'Bash', input: { command: `ssh -F ${C} ab12cd 'x'` } })

    expect(answer.decision).toBe('ask')
  })
}

test('a call out of the sandbox keeps its question', async ($, on) => {
  engine(on, ASK)

  const verdict = await $.tool.check({ tool: 'Bash', input: { command: `ssh -F ${C} ab12cd 'x'`, dangerouslyDisableSandbox: true } })

  expect(verdict.decision).toBe('ask')
})
