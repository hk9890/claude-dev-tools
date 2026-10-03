import { expect, mock, test } from 'claude-code/testing'
import type { On, ProcessRunResult } from 'claude-code'

const SESSION = { cwd: '/repo', surface: 'terminal', isInteractive: true } as const
const PASSED = { status: 'COMPLETED', conclusion: 'SUCCESS' }

function ran(stdout: string, exitCode = 0): { value: ProcessRunResult } {
  return { value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
}

// Stands for the host: answers git and gh from `answers`, keyed by the command's first two words.
function host(on: On, answers: Record<string, { value: ProcessRunResult } | Error> = {}) {
  const seen = { status: [] as (string | undefined)[], toasts: [] as string[], ran: [] as string[] }

  on('process.run', ($, e) => {
    const answer = answers[e.argv.slice(0, 2).join(' ')] ?? ran('', 1)

    if (answer instanceof Error) {
      throw answer
    }

    return answer
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
