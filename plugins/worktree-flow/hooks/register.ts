import type { EngineInterface, Register, Timer } from 'claude-code'

const DENY_REASON =
  'Use the EnterWorktree tool for a persistent worktree, not `git worktree add`: it creates the worktree under .claude/worktrees/ and enters it in one step, and ExitWorktree can remove it later. A throwaway probe (`git worktree add --detach <dir> <ref>`) into /tmp or the scratchpad is allowed. If EnterWorktree cannot express what you need, tell the user instead of creating the worktree by hand.'

// `git` must sit in command position, so a commit message or PR body that mentions the command
// passes. Options between `git` and `worktree` (`git -C <dir> worktree add`) still match, but not
// across a `;`, `&` or `|`.
const GIT_OPTION = String.raw`\s+-[^;&|\s]*(?:\s+[^-;&|\s][^;&|\s]*)?`
const WORKTREE_ADD = new RegExp(
  String.raw`(?:^|[;&|(])\s*git\s+worktree\s+add(?:\s[^;&|]*|$)`,
  'g',
)
const THROWAWAY_TARGET = /\/scratchpad\/|(?:^|[\s"'=])\/tmp\/|mktemp|\$\{?TMPDIR/

// A heredoc body is text for the command that reads it, except where a shell is on that line.
const HEREDOC = /(?<!<)<<(?!<)(-?)\s*(['"]?)([A-Za-z_]\w*)\2/
const SHELL = /\b(?:bash|sh|zsh)\b/

// A push, a change of branch, or a command that opens or closes a pull request changes what the
// status line shows. A command that only reads a pull request does not.
const PUSHES = new RegExp(String.raw`(?:^|[;&|(])\s*git(?:${GIT_OPTION})*\s+push\b`, 'm')
const CHANGES_STATUS_LINE = new RegExp(
  String.raw`(?:^|[;&|(])\s*(?:git(?:${GIT_OPTION})*\s+(?:push|switch|checkout)|gh\s+pr\s+(?:create|merge|close|reopen))\b`,
  'm',
)

const FAILED_CHECK = ['FAILURE', 'ERROR', 'TIMED_OUT', 'CANCELLED', 'ACTION_REQUIRED', 'STARTUP_FAILURE']
const WAITING_STATE = ['PENDING', 'EXPECTED']
const CHECKS_RUNNING = ' checks running'

// The pace while checks run or are due, and the pace for the rest.
const FAST_REFRESH_MS = 60_000
const SLOW_REFRESH_MS = 5 * 60_000

// GitHub registers the checks of a push late, so this many refreshes look for them at the fast pace.
const REFRESHES_AFTER_PUSH = 5

type Check = { status?: string; conclusion?: string; state?: string }
type PullRequest = { number: number; state: string; statusCheckRollup: Check[] }

let latestRefresh = 0
let nextRefresh: Timer | undefined
let refreshesForNewChecks = 0

// The lines the shell runs. A `<<` with no closing line is not a heredoc, and no line is left out.
function commandLines(command: string) {
  const lines = command.split(/\r?\n/)
  const run: string[] = []

  for (let at = 0; at < lines.length; at++) {
    const line = lines[at] ?? ''
    const [, dash, , word] = line.match(HEREDOC) ?? []
    run.push(line)

    if (word !== undefined && !SHELL.test(line)) {
      const closing = lines.findIndex(
        (body, index) => index > at && (dash === '-' ? body.replace(/^\t+/, '') : body) === word,
      )
      at = closing === -1 ? at : closing
    }
  }

  return run
}

// A throwaway probe is judged by the arguments of the add itself, not by the rest of the command,
// so each line is matched alone and every add on it must name a throwaway target.
function addsPersistentWorktree(command: string) {
  const adds = commandLines(command).flatMap(line => line.match(WORKTREE_ADD) ?? [])

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

  return checks.some(isRunning) ? CHECKS_RUNNING : ' checks passed'
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

// Asked at each refresh: the desktop app joins a session after it started, and can leave it.
async function hasStatusLine($: EngineInterface) {
  return (await $.session.surfaces()).some(surface => surface === 'terminal' || surface === 'desktop')
}

// A refresh that a later one overtook is dropped, and one whose git did not run clears the status.
// Each refresh plans the next one, because a check can finish with no local event. No next one is
// planned where no surface draws the status line, or when git says the session left the worktree.
async function showWorktree($: EngineInterface) {
  const refresh = ++latestRefresh
  nextRefresh?.cancel()
  nextRefresh = undefined

  if (!(await hasStatusLine($))) {
    return
  }

  let label: string | undefined
  let hasGitRun = true

  try {
    label = await worktreeLabel($)
  } catch {
    hasGitRun = false
  }

  if (refresh !== latestRefresh) {
    return
  }

  $.ui.status(label)

  if (label === undefined && hasGitRun) {
    return
  }

  const isFast = refreshesForNewChecks > 0 || label?.endsWith(CHECKS_RUNNING) === true
  refreshesForNewChecks = Math.max(0, refreshesForNewChecks - 1)
  nextRefresh = $.clock.after(isFast ? FAST_REFRESH_MS : SLOW_REFRESH_MS, () => void showWorktree($))
}

export const register: Register = on => {
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    if (addsPersistentWorktree(e.command)) {
      $.ui.toast('use EnterWorktree, not git worktree add')

      return { deny: DENY_REASON }
    }

    const ran = await next(e)

    if (PUSHES.test(e.command)) {
      refreshesForNewChecks = REFRESHES_AFTER_PUSH
    }

    if (CHANGES_STATUS_LINE.test(e.command)) {
      void showWorktree($)
    }

    return ran
  })

  on('tool.call', { tool: ['EnterWorktree', 'ExitWorktree'] }, async ($, e, next) => {
    const ran = await next(e)
    void showWorktree($)

    return ran
  })

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    void showWorktree($)

    return started
  })

  // The desktop app joins a session that started with no surface.
  on('session.attach', { surface: 'desktop' }, async ($, e, next) => {
    const attached = await next(e)
    void showWorktree($)

    return attached
  })
}
