import { expect, mock, test } from 'claude-code/testing'
import type { On, ProcessRunResult, RenderSurface } from 'claude-code'

const SESSION = { cwd: '/repo', surface: 'terminal', isInteractive: true } as const
const HEADLESS = { cwd: '/repo', surface: null, isInteractive: false } as const
const PASSED = { status: 'COMPLETED', conclusion: 'SUCCESS' }
const REFRESH_MS = 5 * 60_000
const FAST_REFRESH_MS = 60_000
const RUNNING = { status: 'IN_PROGRESS' }
const TEN_MINUTES = 10 * 60_000

type Answer = { value: ProcessRunResult }

function ran(stdout: string, exitCode = 0): Answer {
  return { value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
}

// Stands for the host: answers git and gh from `answers`, keyed by the command's first two words.
// An answer that is a function is a command that answers late.
function host(on: On, answers: Record<string, Answer | Error | (() => Promise<Answer>)> = {}) {
  const seen = {
    status: [] as (string | undefined)[],
    toasts: [] as string[],
    ran: [] as string[],
    commands: [] as string[],
  }
  const surfaces: RenderSurface[] = []

  on('process.run', ($, e) => {
    seen.commands.push(e.argv.join(' '))
    const answer = answers[e.argv.slice(0, 2).join(' ')] ?? ran('', 1)

    if (answer instanceof Error) {
      throw answer
    }

    return typeof answer === 'function' ? answer() : answer
  })
  on('ui.status', ($, e) => {
    seen.status.push(e.text)

    return { value: undefined }
  })
  on('ui.toast', ($, e) => {
    seen.toasts.push(e.text)

    return { value: undefined }
  })
  on('tool.call', ($, e) => {
    seen.ran.push(String(e.tool))

    return { result: 'ok' }
  })
  on('session.start', ($, e) => {
    surfaces.push(...(e.surface === null ? [] : [e.surface]))

    return { cwd: e.cwd }
  })
  on('session.attach', ($, e) => {
    surfaces.push(e.surface)

    return { clientId: e.clientId }
  })
  on('session.detach', ($, e) => {
    surfaces.splice(surfaces.indexOf(e.surface), 1)

    return { clientId: e.clientId }
  })
  on('session.surfaces', () => ({ value: surfaces }))

  return seen
}

const PR_BODY_WITH_THE_COMMAND = [
  'gh pr create --title "Guard notes" --body-file - <<\'EOF\'',
  'The guard refuses this line:',
  'git worktree add ../feature feat/x',
  'EOF',
].join('\n')

const DENIED = [
  'git worktree add ../feature -b feature',
  'git -C /home/me/repo worktree add .claude/worktrees/x',
  'cd repo && git worktree add ../x',
  'git worktree add',
  'git worktree add ../x && ls /tmp/',
  'git worktree add ../x\nls /tmp/',
  'git worktree add ../x-scratchpad-feature',
  'echo start\ngit worktree add ../x',
  'result=$(git worktree add ../x)',
  'git -c core.x=y --no-pager worktree add ../x',
  'git worktree add --detach /tmp/probe HEAD; git worktree add ../x',
  "bash <<'EOF'\ngit worktree add ../x\nEOF",
  'cat <<EOF | sh\ngit worktree add ../x\nEOF',
  "cat <<'EOF'\nsome text\nEOF\ngit worktree add ../x",
  'echo $((1 << n))\ngit worktree add ../x',
  'cat <<< EOF\ngit worktree add ../x\nEOF',
]

const ALLOWED = [
  'git worktree list',
  'git worktree remove .claude/worktrees/x',
  'git worktree prune',
  'git worktree add --detach /tmp/probe HEAD',
  'git worktree add --detach "$(mktemp -d)" HEAD',
  'echo git; worktree add',
  'grep -n "worktree add" docs/CHANGE-WORKFLOW.md',
  'ls .git/worktrees',
  'git commit -m "use git worktree add here"',
  'gh pr create --body "blocks git worktree add now"',
  PR_BODY_WITH_THE_COMMAND,
  'cat > notes.md <<-"END"\n\tgit worktree add ../x\n\tEND',
]

for (const command of DENIED) {
  test(`denies: ${command}`, async ($, on) => {
    const seen = host(on)

    const answer = await $.tool.call({ tool: 'Bash', command })

    expect(answer.deny).toContain('EnterWorktree')
    expect(seen.ran).toEqual([])
    expect(seen.toasts).toEqual(['use EnterWorktree, not git worktree add'])
  })
}

for (const command of ALLOWED) {
  test(`allows: ${command}`, async ($, on) => {
    const seen = host(on)

    const answer = await $.tool.call({ tool: 'Bash', command })

    expect(answer.deny).toBeUndefined()
    expect(seen.ran).toEqual(['Bash'])
    expect(seen.toasts).toEqual([])
  })
}

test('the status line shows the worktree, the branch and the pull request', async ($, on) => {
  const clock = mock.clock(on)
  const seen = host(on, {
    'git rev-parse': ran('/repo/.claude/worktrees/fix-login\n'),
    'git branch': ran('fix/login\n'),
    'gh pr': ran(JSON.stringify({ number: 12, state: 'OPEN', statusCheckRollup: [PASSED, PASSED] })),
  })

  await $.session.start(SESSION)
  await clock.settle()

  expect(seen.status).toEqual(['fix-login on fix/login PR#12 open checks passed'])
  expect(seen.commands).toContain('gh pr view --json number,state,statusCheckRollup')
})

test('the status line follows the checks on the next refresh', async ($, on) => {
  const clock = mock.clock(on)
  const answers = {
    'git rev-parse': ran('/repo/.claude/worktrees/fix-login\n'),
    'git branch': ran('fix/login\n'),
    'gh pr': ran(JSON.stringify({ number: 12, state: 'OPEN', statusCheckRollup: [PASSED, { status: 'IN_PROGRESS' }] })),
  }
  const seen = host(on, answers)

  await $.session.start(SESSION)
  await clock.settle()
  answers['gh pr'] = ran(
    JSON.stringify({
      number: 12,
      state: 'OPEN',
      statusCheckRollup: [PASSED, { status: 'COMPLETED', conclusion: 'FAILURE' }],
    }),
  )
  await clock.advance(REFRESH_MS)

  expect(seen.status).toEqual([
    'fix-login on fix/login PR#12 open checks running',
    'fix-login on fix/login PR#12 open checks failed',
  ])
})

test('the main checkout shows no status entry', async ($, on) => {
  const clock = mock.clock(on)
  const seen = host(on, { 'git rev-parse': ran('/repo\n') })

  await $.session.start(SESSION)
  await clock.settle()

  expect(seen.status).toEqual([undefined])
})

test('without gh the status line shows the worktree and the branch', async ($, on) => {
  const clock = mock.clock(on)
  const seen = host(on, {
    'git rev-parse': ran('/repo/.claude/worktrees/fix-login\n'),
    'git branch': ran('fix/login\n'),
    'gh pr': new Error('gh: command not found'),
  })

  await $.session.start(SESSION)
  await clock.settle()

  expect(seen.status).toEqual(['fix-login on fix/login'])
})

test('a branch with no pull request shows the worktree and the branch', async ($, on) => {
  const clock = mock.clock(on)
  const seen = host(on, {
    'git rev-parse': ran('/repo/.claude/worktrees/fix-login\n'),
    'git branch': ran('fix/login\n'),
    'gh pr': ran('', 1),
  })

  await $.session.start(SESSION)
  await clock.settle()

  expect(seen.status).toEqual(['fix-login on fix/login'])
})

test('a branch pushed under another name shows the pull request of its upstream', async ($, on) => {
  const clock = mock.clock(on)
  const seen = host(on, {
    'git rev-parse': ran('/repo/.claude/worktrees/fix-login\n'),
    'git branch': ran('worktree-fix-login\n'),
    'git config': ran('refs/heads/fix/login\n'),
    'gh pr': ran(JSON.stringify({ number: 12, state: 'OPEN', statusCheckRollup: [] })),
  })

  await $.session.start(SESSION)
  await clock.settle()

  expect(seen.commands).toContain('git config --get branch.worktree-fix-login.merge')
  expect(seen.commands).toContain('gh pr view fix/login --json number,state,statusCheckRollup')
  expect(seen.status).toEqual(['fix-login on worktree-fix-login PR#12 open'])
})

test('a required check that has not reported yet counts as running', async ($, on) => {
  const clock = mock.clock(on)
  const seen = host(on, {
    'git rev-parse': ran('/repo/.claude/worktrees/fix-login\n'),
    'git branch': ran('fix/login\n'),
    'gh pr': ran(JSON.stringify({ number: 12, state: 'OPEN', statusCheckRollup: [PASSED, { state: 'EXPECTED' }] })),
  })

  await $.session.start(SESSION)
  await clock.settle()

  expect(seen.status).toEqual(['fix-login on fix/login PR#12 open checks running'])
})

test('a detached HEAD shows the worktree alone and asks for no pull request', async ($, on) => {
  const clock = mock.clock(on)
  const seen = host(on, {
    'git rev-parse': ran('/repo/.claude/worktrees/fix-login\n'),
    'git branch': ran('\n'),
  })

  await $.session.start(SESSION)
  await clock.settle()

  expect(seen.status).toEqual(['fix-login'])
  expect(seen.commands).toEqual(['git rev-parse --show-toplevel', 'git branch --show-current'])
})

test('when git stops running the status entry is cleared', async ($, on) => {
  const clock = mock.clock(on)
  const answers: Record<string, Answer | Error> = {
    'git rev-parse': ran('/repo/.claude/worktrees/fix-login\n'),
    'git branch': ran('fix/login\n'),
  }
  const seen = host(on, answers)

  await $.session.start(SESSION)
  await clock.settle()
  answers['git rev-parse'] = new Error('spawn git ENOENT')
  await clock.advance(REFRESH_MS)

  expect(seen.status).toEqual(['fix-login on fix/login', undefined])
})

test('a refresh whose git did not run does not stop the poll', async ($, on) => {
  const clock = mock.clock(on)
  const answers: Record<string, Answer | Error> = {
    'git rev-parse': ran('/repo/.claude/worktrees/fix-login\n'),
    'git branch': ran('fix/login\n'),
  }
  const seen = host(on, answers)

  await $.session.start(SESSION)
  await clock.settle()
  answers['git rev-parse'] = new Error('spawn git EAGAIN')
  await clock.advance(REFRESH_MS)
  answers['git rev-parse'] = ran('/repo/.claude/worktrees/fix-login\n')
  await clock.advance(REFRESH_MS)

  expect(seen.status).toEqual(['fix-login on fix/login', undefined, 'fix-login on fix/login'])
})

test('a refresh that a later one overtook does not bring its status back', async ($, on) => {
  const clock = mock.clock(on)
  const answers: Record<string, Answer | (() => Promise<Answer>)> = {
    'git rev-parse': ran('/repo/.claude/worktrees/fix-login\n'),
    'git branch': ran('fix/login\n'),
    'gh pr': async () => {
      await clock.sleep(5_000)

      return ran(JSON.stringify({ number: 12, state: 'OPEN', statusCheckRollup: [] }))
    },
  }
  const seen = host(on, answers)

  await $.session.start(SESSION)
  await clock.settle()
  answers['git rev-parse'] = ran('/repo\n')
  await $.tool.call({ tool: 'ExitWorktree', action: 'keep' })
  await clock.advance(5_000)

  expect(seen.status).toEqual([undefined])
})

test('entering a worktree refreshes the status line at once', async ($, on) => {
  const clock = mock.clock(on)
  const answers = { 'git rev-parse': ran('/repo\n'), 'git branch': ran('feat/x\n') }
  const seen = host(on, answers)

  await $.session.start(SESSION)
  await clock.settle()
  answers['git rev-parse'] = ran('/repo/.claude/worktrees/feat-x\n')
  await $.tool.call({ tool: 'EnterWorktree', name: 'feat-x' })
  await clock.settle()

  expect(seen.status).toEqual([undefined, 'feat-x on feat/x'])
})

test('a headless session runs no git and sets no status', async ($, on) => {
  const clock = mock.clock(on)
  const seen = host(on, { 'git rev-parse': ran('/repo/.claude/worktrees/fix-login\n') })

  await $.session.start(HEADLESS)
  await $.tool.call({ tool: 'EnterWorktree', name: 'fix-login' })
  await clock.advance(TEN_MINUTES)

  expect(seen.status).toEqual([])
  expect(seen.commands).toEqual([])
})

test('the desktop app that joins a session gets the status line', async ($, on) => {
  const clock = mock.clock(on)
  const seen = host(on, {
    'git rev-parse': ran('/repo/.claude/worktrees/fix-login\n'),
    'git branch': ran('fix/login\n'),
  })

  await $.session.start(HEADLESS)
  await $.session.attach({ surface: 'desktop', clientId: 'desktop:default' })
  await clock.settle()

  expect(seen.status).toEqual(['fix-login on fix/login'])
})

test('a mod that loads into a session with the desktop app attached shows the status line', async ($, on) => {
  const clock = mock.clock(on)
  const seen = host(on, {
    'git rev-parse': ran('/repo/.claude/worktrees/fix-login\n'),
    'git branch': ran('fix/login\n'),
  })

  await $.session.start({ ...HEADLESS, surface: 'desktop' })
  await clock.settle()

  expect(seen.status).toEqual(['fix-login on fix/login'])
})

test('a phone that joins a session starts no status line', async ($, on) => {
  const clock = mock.clock(on)
  const seen = host(on, { 'git rev-parse': ran('/repo/.claude/worktrees/fix-login\n') })

  await $.session.start(HEADLESS)
  await $.session.attach({ surface: 'mobile', clientId: 'mobile:default' })
  await clock.settle()

  expect(seen.commands).toEqual([])
})

test('inside a worktree gh is asked once per 5 minutes while nothing happens', async ($, on) => {
  const clock = mock.clock(on)
  const seen = host(on, {
    'git rev-parse': ran('/repo/.claude/worktrees/fix-login\n'),
    'git branch': ran('fix/login\n'),
    'gh pr': ran(JSON.stringify({ number: 12, state: 'OPEN', statusCheckRollup: [PASSED] })),
  })

  await $.session.start(SESSION)
  await clock.settle()
  await clock.advance(TEN_MINUTES)

  expect(seen.commands.filter(command => command.startsWith('gh pr'))).toHaveLength(3)
})

test('a push refreshes the status line at once', async ($, on) => {
  const clock = mock.clock(on)
  const answers: Record<string, Answer> = {
    'git rev-parse': ran('/repo/.claude/worktrees/fix-login\n'),
    'git branch': ran('fix/login\n'),
  }
  const seen = host(on, answers)

  await $.session.start(SESSION)
  await clock.settle()
  answers['gh pr'] = ran(JSON.stringify({ number: 12, state: 'OPEN', statusCheckRollup: [] }))
  await $.tool.call({ tool: 'Bash', command: 'git push -u origin HEAD:fix/login' })
  await clock.settle()

  expect(seen.status).toEqual(['fix-login on fix/login', 'fix-login on fix/login PR#12 open'])
})

// GitHub registers the checks of a push late: the refresh at the push does not see them yet.
test('after a push gh is asked once per minute for 5 minutes, then once per 5 minutes', async ($, on) => {
  const clock = mock.clock(on)
  const seen = host(on, {
    'git rev-parse': ran('/repo/.claude/worktrees/fix-login\n'),
    'git branch': ran('fix/login\n'),
    'gh pr': ran(JSON.stringify({ number: 12, state: 'OPEN', statusCheckRollup: [PASSED] })),
  })
  const askedGh = () => seen.commands.filter(command => command.startsWith('gh pr')).length

  await $.session.start(SESSION)
  await clock.settle()
  await $.tool.call({ tool: 'Bash', command: 'git push' })
  await clock.settle()
  expect(askedGh()).toBe(2)

  await clock.advance(5 * FAST_REFRESH_MS)
  expect(askedGh()).toBe(7)

  await clock.advance(REFRESH_MS - 1)
  expect(askedGh()).toBe(7)

  await clock.advance(1)
  expect(askedGh()).toBe(8)
})

test('while checks run gh is asked once per minute', async ($, on) => {
  const clock = mock.clock(on)
  const answers: Record<string, Answer> = {
    'git rev-parse': ran('/repo/.claude/worktrees/fix-login\n'),
    'git branch': ran('fix/login\n'),
    'gh pr': ran(JSON.stringify({ number: 12, state: 'OPEN', statusCheckRollup: [PASSED, RUNNING] })),
  }
  const seen = host(on, answers)

  await $.session.start(SESSION)
  await clock.settle()
  await clock.advance(2 * FAST_REFRESH_MS)
  answers['gh pr'] = ran(JSON.stringify({ number: 12, state: 'OPEN', statusCheckRollup: [PASSED, PASSED] }))
  await clock.advance(FAST_REFRESH_MS)

  expect(seen.status).toEqual([
    'fix-login on fix/login PR#12 open checks running',
    'fix-login on fix/login PR#12 open checks running',
    'fix-login on fix/login PR#12 open checks running',
    'fix-login on fix/login PR#12 open checks passed',
  ])

  await clock.advance(REFRESH_MS - 1)
  expect(seen.status).toHaveLength(4)
})

test('the status line stops when the desktop app leaves a headless session', async ($, on) => {
  const clock = mock.clock(on)
  const seen = host(on, {
    'git rev-parse': ran('/repo/.claude/worktrees/fix-login\n'),
    'git branch': ran('fix/login\n'),
  })

  await $.session.start(HEADLESS)
  await $.session.attach({ surface: 'desktop', clientId: 'desktop:default' })
  await clock.settle()
  await $.session.detach({ surface: 'desktop', clientId: 'desktop:default', reason: 'detach' })
  const ranUntilDetach = seen.commands.length
  await clock.advance(6 * TEN_MINUTES)

  expect(seen.commands).toHaveLength(ranUntilDetach)
})

test('a change of branch refreshes the status line at once', async ($, on) => {
  const clock = mock.clock(on)
  const answers: Record<string, Answer> = {
    'git rev-parse': ran('/repo/.claude/worktrees/fix-login\n'),
    'git branch': ran('fix/login\n'),
  }
  const seen = host(on, answers)

  await $.session.start(SESSION)
  await clock.settle()
  answers['git branch'] = ran('fix/logout\n')
  await $.tool.call({ tool: 'Bash', command: 'git switch -c fix/logout' })
  await clock.settle()

  expect(seen.status).toEqual(['fix-login on fix/login', 'fix-login on fix/logout'])
})

test('a command that opens a pull request refreshes the status line, one that reads it does not', async ($, on) => {
  const clock = mock.clock(on)
  const seen = host(on, {
    'git rev-parse': ran('/repo/.claude/worktrees/fix-login\n'),
    'git branch': ran('fix/login\n'),
  })

  await $.session.start(SESSION)
  await clock.settle()
  await $.tool.call({ tool: 'Bash', command: 'git commit -m "fix: push the gh pr create text"' })
  await $.tool.call({ tool: 'Bash', command: 'gh pr checks 12' })
  await $.tool.call({ tool: 'Bash', command: 'gh pr view 12 --json state' })
  await clock.settle()
  expect(seen.status).toHaveLength(1)

  await $.tool.call({ tool: 'Bash', command: 'cd /repo && gh pr create --fill' })
  await clock.settle()
  expect(seen.status).toHaveLength(2)
})

test('outside a worktree git runs once and no timer starts', async ($, on) => {
  const clock = mock.clock(on)
  const seen = host(on, { 'git rev-parse': ran('/repo\n') })

  await $.session.start(SESSION)
  await clock.advance(TEN_MINUTES)

  expect(seen.commands).toEqual(['git rev-parse --show-toplevel'])
})

test('the timer starts with the worktree and stops when the session leaves it', async ($, on) => {
  const clock = mock.clock(on)
  const answers = { 'git rev-parse': ran('/repo\n'), 'git branch': ran('feat/x\n') }
  const seen = host(on, answers)

  await $.session.start(SESSION)
  await clock.settle()
  answers['git rev-parse'] = ran('/repo/.claude/worktrees/feat-x\n')
  await $.tool.call({ tool: 'EnterWorktree', name: 'feat-x' })
  await clock.advance(REFRESH_MS)
  expect(seen.status).toEqual([undefined, 'feat-x on feat/x', 'feat-x on feat/x'])

  answers['git rev-parse'] = ran('/repo\n')
  await $.tool.call({ tool: 'ExitWorktree', action: 'keep' })
  await clock.settle()
  const ranUntilExit = seen.commands.length
  await clock.advance(TEN_MINUTES)

  expect(seen.status.at(-1)).toBeUndefined()
  expect(seen.commands).toHaveLength(ranUntilExit)
})
