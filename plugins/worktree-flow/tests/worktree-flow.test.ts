import { expect, mock, test } from 'claude-code/testing'
import type { On, ProcessRunResult } from 'claude-code'

const SESSION = { cwd: '/repo', surface: 'terminal', isInteractive: true } as const
const PASSED = { status: 'COMPLETED', conclusion: 'SUCCESS' }

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
  on('session.start', ($, e) => ({ cwd: e.cwd }))

  return seen
}

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
  await clock.advance(60_000)

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
  await clock.advance(60_000)

  expect(seen.status).toEqual(['fix-login on fix/login', undefined])
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

  await $.session.start({ ...SESSION, surface: null, isInteractive: false })
  await clock.advance(120_000)

  expect(seen.status).toEqual([])
})
