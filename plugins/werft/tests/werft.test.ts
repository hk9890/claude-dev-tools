import { expect, test } from 'claude-code/testing'
import type { On, ProcessRunResult, ToolCheckResult } from 'claude-code'

// The release outlives the session end only in a session of its own with its output closed,
// releases each owner it is given, and runs once more where it fails.
const DETACHED_RELEASE = `command -v werft >/dev/null || exit 99; exec setsid -f sh -c 'for o; do werft --json release --owner "$o" || werft --json release --owner "$o"; done' sh "$@" </dev/null >/dev/null 2>&1`

const END = { reason: 'prompt_input_exit', sessionId: 's1', resume: { id: 's1' } } as const

function ran(exitCode: number, stdout: string): { value: ProcessRunResult } {
  return { value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
}

// Stands for the host: records the owner of each release started and each debug line, and ends
// the session. A host with no werft is `{ releaseExit: 99 }`, a host whose `sh` cannot start the
// detached release (no setsid) is `{ releaseExit: 127 }`.
function host(on: On, { releaseExit = 0 } = {}) {
  const seen = { released: [] as string[], logged: [] as string[], ended: [] as string[], ran: [] as string[] }

  on('session.id', () => ({ value: 's1' }))
  on('tool.call', { tool: 'Bash' }, ($, e) => {
    seen.ran.push(e.command)

    return { result: 'ok' }
  })

  on('process.run', ($, e) => {
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

test('a lease of a subagent takes the owner of that agent, which the session end releases', async ($, on) => {
  const seen = host(on)

  await $.tool.call({ tool: 'Bash', command: 'werft --json lease ubuntu-26-04 --owner claude-s1 --for 1h', agentId: 'ag1' })
  await $.tool.call({ tool: 'Bash', command: 'werft --json lease ubuntu-26-04 --owner=claude-s1', agentId: 'ag2' })
  await $.tool.call({ tool: 'Bash', command: 'werft lease my-owner -owner claude-s1', agentId: 'ag2' })
  await $.tool.call({ tool: 'Bash', command: 'werft lease img --tier --owner --owner claude-s1', agentId: 'ag2' })
  await $.tool.call({ tool: 'Bash', command: 'werft --json lease ubuntu-26-04 --owner claude-s1-ag3', agentId: 'ag3' })
  await $.tool.call({ tool: 'Bash', command: 'werft --json lease ubuntu-26-04 --desktop --owner claude-s1', agentId: 'ag3' })
  await $.tool.call({ tool: 'Bash', command: 'werft --json lease ubuntu-26-04 --owner claude-s1\n', agentId: 'ag3' })
  await $.session.end(END)

  expect(seen.ran).toEqual(['werft --json lease ubuntu-26-04 --owner claude-s1-ag1 --for 1h', 'werft --json lease ubuntu-26-04 --owner=claude-s1-ag2', 'werft lease my-owner -owner claude-s1-ag2', 'werft lease img --tier --owner --owner claude-s1-ag2', 'werft --json lease ubuntu-26-04 --owner claude-s1-ag3', 'werft --json lease ubuntu-26-04 --desktop --owner claude-s1-ag3', 'werft --json lease ubuntu-26-04 --owner claude-s1-ag3\n'])
  expect(seen.released).toEqual(['claude-s1', 'claude-s1-ag1', 'claude-s1-ag2', 'claude-s1-ag3'])
})

test('a lease of the main agent and any other command keep their words', async ($, on) => {
  const seen = host(on)

  await $.tool.call({ tool: 'Bash', command: 'werft --json lease ubuntu-26-04 --owner claude-s1' })
  await $.tool.call({ tool: 'Bash', command: 'werft --json lease ubuntu-26-04 --owner hans', agentId: 'ag1' })
  await $.tool.call({ tool: 'Bash', command: 'werft --json release ab12cd', agentId: 'ag1' })
  await $.session.end(END)

  expect(seen.ran).toEqual(['werft --json lease ubuntu-26-04 --owner claude-s1', 'werft --json lease ubuntu-26-04 --owner hans', 'werft --json release ab12cd'])
  expect(seen.released).toEqual(['claude-s1'])
})

test('a lease of a subagent that cannot take its owner does not run', async ($, on) => {
  const seen = host(on)

  const answer = await $.tool.call({ tool: 'Bash', command: 'werft --json lease ubuntu-26-04 --owner claude-s1', agentId: 'a b' })

  expect(answer.deny).toContain('cannot be part of a lease owner')
  expect(seen.ran).toEqual([])
})

test('a /clear releases the leases of the session it ends', async ($, on) => {
  const seen = host(on)

  await $.session.end({ reason: 'clear', sessionId: 's2', resume: { id: 's2' } })

  expect(seen.released).toEqual(['claude-s2'])
})

test('without werft the session ends and the debug log says why', async ($, on) => {
  const seen = host(on, { releaseExit: 99 })

  await $.session.end(END)

  expect(seen.logged).toEqual(['werft: no lease released at the session end: Error: werft is not on PATH'])
  expect(seen.ended).toEqual(['s1'])
})

test('a release that cannot start names setsid in the debug log', async ($, on) => {
  const seen = host(on, { releaseExit: 127 })

  await $.session.end(END)

  expect(seen.logged).toEqual(['werft: no lease released at the session end: Error: the release did not start (exit 127): is setsid -f on PATH?'])
  expect(seen.ended).toEqual(['s1'])
})

const C = '/home/u/.local/state/werft/leases/ab12cd/ssh_config'

// The host's files: the project /p is the working directory; `->` marks a link and its target.
const FILES: Record<string, string> = {
  '/': 'dir',
  '/p': 'dir',
  '/p/file': 'file',
  '/p/src': 'dir',
  '/p/src/a': 'file',
  '/p/dir': 'dir',
  '/p/dir/x': 'file',
  '/p/inlink': '->/p/src',
  '/p/loop': 'dir',
  '/p/loop/self': '->/p/loop',
  '/p/key': '->/home/u/.ssh/id_ed25519',
  '/p/linkdir': '->/home/u/.ssh',
  '/p/leaky': 'dir',
  '/p/leaky/k': '->/home/u/.ssh/id_ed25519',
  '/p/hidden': 'dir',
  '/p/hidden/deep': 'dir',
  '/p/hidden/deep/via': '->/p/linkdir',
  '/p/dangling': '->/nowhere',
  '/p/big': 'dir',
  '/p/full': 'dir',
  '/p/sub': 'dir',
  '/p/sub/notes.txt': '->/home/u/.ssh/id_ed25519',
  '/p/notes.txt': 'file',
  '/p/locked': 'dir',
  '/q': 'dir',
  '/q/file': 'file',
  '/home': 'dir',
  '/home/u': 'dir',
  '/home/u/.ssh': 'dir',
  '/home/u/.ssh/id_ed25519': 'file',
}
const files = (length: number) => Array.from({ length }, (_, n) => ({ name: `f${n}`, kind: 'file' as const, size: 0, mtimeMs: 0, isLink: false }))
// One entry past the tree limit, and the limit itself; /p/locked cannot be listed.
const LISTED: Record<string, ReturnType<typeof files>> = { '/p/big': files(10_001), '/p/full': files(10_000) }

// Where a path lands as realpath(1) resolves it, or undefined where it leads nowhere.
function realPath(path: string): string | undefined {
  if (!path.startsWith('/')) {
    throw new Error(`the engine resolves a relative path against its own directory: ${path}`)
  }

  const parts = path.split('/').filter(part => part && part !== '.')
  let at = ''

  for (const [n, part] of parts.entries()) {
    at = part === '..' ? at.slice(0, at.lastIndexOf('/')) : `${at}/${part}`
    const kind = FILES[at]

    if (kind === undefined) {
      return undefined
    }

    if (kind.startsWith('->')) {
      return realPath([kind.slice(2), ...parts.slice(n + 1)].join('/'))
    }
  }

  return at || '/'
}

const LEASES = JSON.stringify([
  { id: 'ab12cd', owner: 'claude-s1', ssh_config: C },
  { id: 'hh00hh', owner: 'hans', ssh_config: '/home/u/.local/state/werft/leases/hh00hh/ssh_config' },
  { id: 'ag1111', owner: 'claude-s1-ag1', ssh_config: '/home/u/.local/state/werft/leases/ag1111/ssh_config' },
  { id: 'ag2222', owner: 'claude-s1-ag2', ssh_config: '/home/u/.local/state/werft/leases/ag2222/ssh_config' },
])

// Stands for the engine and the host: `verdict` on every call, the session s1, and
// `werft --json leases` prints `listed`: by default the live lease ab12cd of this session with the
// ssh_config C, and the lease hh00hh of the user. The files are FILES, the project is `root`, and
// the session runs in `cwd`. Returns each debug line.
function engine(on: On, verdict: ToolCheckResult, { listed = LEASES, root = '/p', cwd = '/p' } = {}) {
  const logged: string[] = []

  on('tool.check', () => verdict)
  on('session.id', () => ({ value: 's1' }))
  on('process.run', ($, e) => {
    expect(e.argv).toEqual(['werft', '--json', 'leases'])

    return ran(0, listed)
  })
  on('session.root', () => ({ value: root }))
  on('session.cwd', () => ({ value: cwd }))
  on('fs.stat', ($, e) => {
    const own = FILES[e.path]
    const real = realPath(e.path)
    const isLink = own?.startsWith('->') ?? false

    // A link that leads nowhere stats as the link, with no realPath; a missing path rejects.
    if (real === undefined) {
      return isLink ? { value: { kind: 'other' as const, size: 0, mtimeMs: 0, isLink } } : { deny: `ENOENT: ${e.path}` }
    }

    const kind = FILES[real] as 'file' | 'dir'

    return { value: { kind, size: 0, mtimeMs: 0, isLink, ...(e.resolve && { realPath: real }) } }
  })
  on('fs.list', ($, e) => {
    expect(FILES[e.path]).toBe('dir')

    if (e.path === '/p/locked') {
      return Promise.reject(new Error(`EACCES: ${e.path}`))
    }

    const entries = LISTED[e.path]

    if (entries) {
      return { value: entries }
    }

    const children = Object.entries(FILES).filter(([path]) => path.slice(0, path.lastIndexOf('/')) === e.path)

    return {
      value: children.map(([path, kind]) => ({
        name: path.slice(path.lastIndexOf('/') + 1),
        kind: kind.startsWith('->') ? ('other' as const) : (kind as 'file' | 'dir'),
        size: 0,
        mtimeMs: 0,
        isLink: kind.startsWith('->'),
      })),
    }
  })
  on('ui.log', ($, e) => {
    logged.push(e.text)

    return { value: undefined }
  })

  return logged
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
  'werft --json lease ubuntu-26-04 --owner=claude-s1',
  'werft --json lease --owner claude-s1 ubuntu-26-04',
  'werft lease ubuntu-26-04 --json --owner claude-s1',
  'werft release ab12cd --json',
  'werft --json extend ab12cd',
  'werft --json release ag1111',
  'werft --json extend ag1111 --for 1h',
  'werft lease ubuntu-26-04 -owner claude-s1 --memory 8192 --cpus 4 --for 2h',
  'werft --json lease ubuntu-26-04 --owner claude-s1 --desktop',
  'werft --json lease --desktop ubuntu-26-04 --owner claude-s1',
  'werft --json lease ubuntu-26-04 --desktop --tier plain --owner claude-s1 --for 1h --memory 8192 --cpus 4',
  'werft lease --tier plain --desktop --owner=claude-s1 -desktop=true ubuntu-26-04',
  'werft --json lease ubuntu-26-04 --owner claude-s1 --desktop=false',
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
  `scp -F ${C} -r inlink ab12cd:src`,
  `scp -F ${C} -r loop ab12cd:loop`,
  `tar -C . -cf - leaky | ssh -F ${C} ab12cd 'tar -xf -'`,
  `tar -C . -cf - key | ssh -F ${C} ab12cd 'tar -xf -'`,
  `tar -C . -cf - linkdir/ | ssh -F ${C} ab12cd 'tar -xf -'`,
  `scp -F ${C} -r full ab12cd:full`,
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
  'werft --json lease ubuntu-26-04 --owner claude-s1 --desktop --view',
  'werft --json lease --desktop ubuntu-26-04 --owner claude-s1 --view=true',
  'werft --json lease ubuntu-26-04 --owner claude-s1 --desktop=yes',
  'werft --json lease ubuntu-26-04 --owner claude-s1 --desktop yes',
  'werft --json lease ubuntu-26-04 --desktop',
  'werft --json extend ab12cd --desktop',
  'werft --json extend ab12cd --for 1h --desktop',
  'werft --json release ab12cd --desktop',
  'werft --json lease ubuntu-26-04 --tier plain --for 1h',
  'werft --json lease ubuntu-26-04 --owner hans',
  'werft --json lease ubuntu-26-04 --owner=claude-s2',
  'werft --json lease ubuntu-26-04 --owner claude-s1 --owner claude-s1',
  'werft --json lease ubuntu-26-04 --owner',
  'werft --json lease ubuntu-26-04 --owner=',
  'werft --json lease ubuntu-26-04 --tier --owner claude-s1',
  'werft --json lease ubuntu-26-04 extra --owner claude-s1',
  'werft --json lease --owner claude-s1',
  'werft --json release',
  '--json werft --json lease ubuntu-26-04 --owner claude-s1',
  '--json werft images',
  'werft --json lease ubuntu-26-04 --owner claude-s1 --wait --owner=hans',
  'werft --json lease ubuntu-26-04 --stock --json --owner=claude-s1',
  'werft --json lease ubuntu-26-04 --owner claude-s1 --',
  'werft --json extend hh00hh --for 2h',
  'werft --json extend zz99zz',
  'werft --json extend ab12cd --owner claude-s1',
  'werft --json lease ubuntu-26-04 --tier=plain --for --owner=claude-s1',
  'werft --json release --owner claude-s1',
  'werft --json release --owner=claude-s1',
  'werft release -owner claude-s1',
  'werft --json release --owner hans',
  'werft --json release --owner',
  'werft --json release --owner=',
  'werft --json release hh00hh',
  'werft --json release zz99zz',
  'werft --json release ab12cd --owner claude-s1',
  'werft --json release --owner claude-s1 ab12cd',
  'werft --json release ab12cd hh00hh',
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
  `scp -F ${C} key ab12cd:k`,
  `scp -F ${C} linkdir/id_ed25519 ab12cd:k`,
  `scp -F ${C} -r linkdir ab12cd:k`,
  `scp -F ${C} -r leaky ab12cd:k`,
  `scp -F ${C} -r hidden ab12cd:k`,
  `scp -F ${C} -r big ab12cd:big`,
  `scp -F ${C} dangling ab12cd:k`,
  `scp -F ${C} missing ab12cd:k`,
  `tar -C linkdir -cf - . | ssh -F ${C} ab12cd 'cat'`,
  `tar -C . -cf - linkdir/. | ssh -F ${C} ab12cd 'cat'`,
  `tar -C . -cf - linkdir/id_ed25519 | ssh -F ${C} ab12cd 'cat'`,
  `scp -F ${C} -r dangling ab12cd:k`,
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
    // A check that throws keeps the question too, and says so in the debug log.
    const logged = engine(on, ASK)

    const verdict = await $.tool.check({ tool: 'Bash', input: { command } })

    expect(verdict.decision).toBe('ask')
    expect(logged).toEqual([])
  })
}

// The shell reads a relative path from the directory the session runs in, which a cd moves.
test('after a cd, an upload reads from the new directory', async ($, on) => {
  engine(on, ASK, { cwd: '/p/sub' })

  const verdict = await $.tool.check({ tool: 'Bash', input: { command: `scp -F ${C} notes.txt ab12cd:k` } })

  expect(verdict.decision).toBe('ask')
})

test('an upload from a working directory outside the project runs', async ($, on) => {
  engine(on, ASK, { cwd: '/q' })

  const verdict = await $.tool.check({ tool: 'Bash', input: { command: `scp -F ${C} file ab12cd:k` } })

  expect(verdict.decision).toBe('allow')
})

test('a working directory reached through a link does not widen the project', async ($, on) => {
  engine(on, ASK, { cwd: '/p/linkdir' })

  const verdict = await $.tool.check({ tool: 'Bash', input: { command: `scp -F ${C} id_ed25519 ab12cd:k` } })

  expect(verdict.decision).toBe('ask')
})

test('an upload of a session in / runs', async ($, on) => {
  engine(on, ASK, { root: '/', cwd: '/' })

  const verdict = await $.tool.check({ tool: 'Bash', input: { command: `scp -F ${C} p/file ab12cd:k` } })

  expect(verdict.decision).toBe('allow')
})

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

test('a werft that lists what is not JSON keeps the question of a call into a lease', async ($, on) => {
  engine(on, ASK, { listed: 'werft: warning\n' })

  const verdict = await $.tool.check({ tool: 'Bash', input: { command: `ssh -F ${C} ab12cd 'x'` } })

  expect(verdict.decision).toBe('ask')
})

for (const failing of ['process.run', 'session.id'] as const) {
  test(`a ${failing} that fails keeps the question and says why in the debug log`, async ($, on) => {
    const logged: string[] = []
    on('tool.check', () => ASK)
    on('session.id', () => (failing === 'session.id' ? Promise.reject(new Error('no session')) : { value: 's1' }))
    on('process.run', () => (failing === 'process.run' ? Promise.reject(new Error('no werft')) : ran(0, LEASES)))
    on('ui.log', ($, e) => {
      logged.push(e.text)

      return { value: undefined }
    })

    const verdict = await $.tool.check({ tool: 'Bash', input: { command: 'werft --json release ab12cd' } })

    expect(verdict.decision).toBe('ask')
    expect(logged).toHaveLength(1)
    expect(logged[0]).toStartWith("werft: a permission check failed, the engine's verdict stands: ")
  })
}

test('a tree that cannot be listed keeps the question of its copy and says why in the debug log', async ($, on) => {
  const logged = engine(on, ASK)

  const verdict = await $.tool.check({ tool: 'Bash', input: { command: `scp -F ${C} -r locked ab12cd:locked` } })

  expect(verdict.decision).toBe('ask')
  expect(logged).toHaveLength(1)
  expect(logged[0]).toStartWith("werft: a permission check failed, the engine's verdict stands: ")
})

test('a werft that lists what is not a JSON list keeps the question without a failure', async ($, on) => {
  const logged = engine(on, ASK, { listed: '{"id":"ab12cd"}' })

  const verdict = await $.tool.check({ tool: 'Bash', input: { command: 'werft --json release ab12cd' } })

  expect(verdict.decision).toBe('ask')
  expect(logged).toEqual([])
})

const IN_AGENT_ALLOWED = ['werft --json release ag1111', 'werft --json lease --desktop ubuntu-26-04 --owner claude-s1', 'werft --json extend ag1111 --for 1h', 'werft --json lease ubuntu-26-04 --owner claude-s1', 'werft --json lease ubuntu-26-04 --owner claude-s1-ag1']
const IN_AGENT_ASKED = ['werft --json release ab12cd', 'werft --json extend ab12cd', 'werft --json lease ubuntu-26-04 --owner claude-s1-ag2', 'werft --json release ag2222']

for (const command of IN_AGENT_ALLOWED) {
  test(`allows in the subagent ag1: ${command}`, async ($, on) => {
    engine(on, ASK)

    const verdict = await $.tool.check({ tool: 'Bash', input: { command }, agentId: 'ag1' })

    expect(verdict.decision).toBe('allow')
  })
}

for (const command of IN_AGENT_ASKED) {
  test(`keeps the question in the subagent ag1: ${command}`, async ($, on) => {
    engine(on, ASK)

    const verdict = await $.tool.check({ tool: 'Bash', input: { command }, agentId: 'ag1' })

    expect(verdict.decision).toBe('ask')
  })
}

test('a call out of the sandbox keeps its question', async ($, on) => {
  engine(on, ASK)

  const verdict = await $.tool.check({ tool: 'Bash', input: { command: `ssh -F ${C} ab12cd 'x'`, dangerouslyDisableSandbox: true } })

  expect(verdict.decision).toBe('ask')
})
