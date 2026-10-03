import type { EngineInterface, Register } from 'claude-code'

const DENY_REASON =
  'Use the EnterWorktree tool for a persistent worktree, not `git worktree add`: it creates the worktree under .claude/worktrees/ and enters it in one step, and ExitWorktree can remove it later. A throwaway probe (`git worktree add --detach <dir> <ref>`) into /tmp or the scratchpad is allowed. If EnterWorktree cannot express what you need, tell the user instead of creating the worktree by hand.'

// `git` must sit in command position, so a commit message or PR body that mentions the command
// passes. Options between `git` and `worktree` (`git -C <dir> worktree add`) still match, but not
// across a `;`, `&` or `|`.
const GIT_OPTION = String.raw`\s+-[^;&|\s]*(?:\s+[^-;&|\s][^;&|\s]*)?`
const WORKTREE_ADD = new RegExp(
  String.raw`(?:^|[;&|(])\s*git(?:${GIT_OPTION})*\s+worktree\s+add(?:\s[^;&|]*|$)`,
  'g',
)
const THROWAWAY_TARGET = /\/scratchpad\/|(?:^|[\s"'=])\/tmp\/|mktemp|\$\{?TMPDIR/

const FAILED_CHECK = ['FAILURE', 'ERROR', 'TIMED_OUT', 'CANCELLED', 'ACTION_REQUIRED', 'STARTUP_FAILURE']
const WAITING_STATE = ['PENDING', 'EXPECTED']
const STATUS_REFRESH_MS = 60_000

type Check = { status?: string; conclusion?: string; state?: string }
type PullRequest = { number: number; state: string; statusCheckRollup: Check[] }

let latestRefresh = 0

// A throwaway probe is judged by the arguments of the add itself, not by the rest of the command,
// so each line is matched alone and every add on it must name a throwaway target.
function addsPersistentWorktree(command: string) {
  const adds = command.split(/\r?\n/).flatMap(line => line.match(WORKTREE_ADD) ?? [])

  return adds.some(add => !THROWAWAY_TARGET.test(add))
}

function checksLabel(checks: Check[]) {
  if (checks.length === 0) {
    return ''
  }

  if (checks.some(check => FAILED_CHECK.includes(check.conclusion ?? check.state ?? ''))) {
    return ' checks failed'
  }

  const isRunning = (check: Check) =>
    WAITING_STATE.includes(check.state ?? '') || (check.status !== undefined && check.status !== 'COMPLETED')

  return checks.some(isRunning) ? ' checks running' : ' checks passed'
}

// gh finds a pull request by the local branch name. A push can name the remote branch differently
// (`git push -u origin HEAD:feat/x`), and then gh is asked for the upstream's name.
async function pullRequestLabel($: EngineInterface, branch: string) {
  try {
    const upstream = (await $.process.run(['git', 'config', '--get', `branch.${branch}.merge`])).stdout.trim()
    const pushedAs = upstream.startsWith('refs/heads/') ? upstream.slice('refs/heads/'.length) : branch
    const selector = pushedAs === branch ? [] : [pushedAs]
    const viewed = await $.process.run(['gh', 'pr', 'view', ...selector, '--json', 'number,state,statusCheckRollup'])

    if (viewed.exitCode !== 0) {
      return ''
    }

    const pr: PullRequest = JSON.parse(viewed.stdout)

    return ` PR#${pr.number} ${pr.state.toLowerCase()}${checksLabel(pr.statusCheckRollup)}`
  } catch {
    return ''
  }
}

// The status text, or undefined outside `.claude/worktrees/<name>`. A detached HEAD has no branch.
async function worktreeLabel($: EngineInterface) {
  const top = await $.process.run(['git', 'rev-parse', '--show-toplevel'])
  const name = top.stdout.trim().split('/.claude/worktrees/')[1]

  if (top.exitCode !== 0 || name === undefined) {
    return undefined
  }

  const branch = (await $.process.run(['git', 'branch', '--show-current'])).stdout.trim()

  return branch === '' ? name : `${name} on ${branch}${await pullRequestLabel($, branch)}`
}

// A refresh that a later one overtook is dropped, and one whose git did not run clears the status.
async function showWorktree($: EngineInterface) {
  const refresh = ++latestRefresh
  const label = await worktreeLabel($).catch(() => undefined)

  if (refresh === latestRefresh) {
    $.ui.status(label)
  }
}

export const register: Register = on => {
  on('tool.call', { tool: 'Bash' }, ($, e, next) => {
    if (addsPersistentWorktree(e.command)) {
      $.ui.toast('use EnterWorktree, not git worktree add')

      return { deny: DENY_REASON }
    }

    return next(e)
  })

  on('tool.call', { tool: ['EnterWorktree', 'ExitWorktree'] }, async ($, e, next) => {
    const ran = await next(e)
    void showWorktree($)

    return ran
  })

  on('session.start', ($, e, next) => {
    if (e.isInteractive) {
      void showWorktree($)
      $.clock.every(STATUS_REFRESH_MS, () => void showWorktree($))
    }

    return next(e)
  })
}
