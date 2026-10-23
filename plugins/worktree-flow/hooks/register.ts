import type { Register } from 'claude-code'

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

// A heredoc body is text for the command that reads it, except where a shell is on that line. A
// shell is a word of its own or the end of a path (`/bin/sh`), not a file name such as `run.sh`.
const HEREDOC = /(?<!<)<<(?!<)(-?)\s*(['"]?)([A-Za-z_]\w*)\2/
const SHELL = /(?<![\w.-])(?:bash|sh|zsh)(?![\w.-])/

// The lines the shell runs. A `<<` with no closing line is not a heredoc, and no line is left out.
// A heredoc body that a shell reads runs in that shell, so its lines are marked `inner`.
function commandLines(command: string) {
  const lines = command.split(/\r?\n/)
  const run: { line: string; inner: boolean }[] = []
  let innerUntil = -1

  for (let at = 0; at < lines.length; at++) {
    const line = lines[at] ?? ''
    const [, dash, , word] = line.match(HEREDOC) ?? []
    run.push({ line, inner: at <= innerUntil })

    if (word !== undefined) {
      const closing = lines.findIndex(
        (body, index) => index > at && (dash === '-' ? body.replace(/^\t+/, '') : body) === word,
      )

      if (!SHELL.test(line)) {
        at = closing === -1 ? at : closing
      } else {
        innerUntil = Math.max(innerUntil, closing)
      }
    }
  }

  return run
}

// Only a whole command sets a variable for the commands after it: `echo W=/tmp/x` and the prefix
// in `W=/tmp/x true` do not, and a subshell's assignment ends with it.
const ASSIGNMENT = /(?:^|;|&&|\|\|)\s*([A-Za-z_]\w*)=("[^"]*"|'[^']*'|[^\s;&|()]*)\s*(?=;|&&|\|\||$)/g
const VARIABLE = /\$(?:\{([A-Za-z_]\w*)\}|([A-Za-z_]\w*))/g

// `W=/tmp/x && git worktree add $W` names its target through a variable: the add takes the value
// of the last assignment before it, on its line or an earlier one of the same shell. A variable
// with no such assignment stays as written.
function expandVariables(add: string, before: string) {
  const values = new Map<string, string>()

  for (const [, name = '', value = ''] of before.matchAll(ASSIGNMENT)) {
    values.set(name, value.replace(/^(["'])(.*)\1$/, '$2'))
  }

  return add.replace(VARIABLE, (reference, braced, bare) => values.get(braced ?? bare) ?? reference)
}

// A throwaway probe is judged by the arguments of the add itself, not by the rest of the command,
// so each line is matched alone and every add on it must name a throwaway target.
function addsPersistentWorktree(command: string) {
  const lines = commandLines(command)
  const adds = lines.flatMap(({ line, inner }, at) => {
    const earlier = lines
      .slice(0, at)
      .filter(other => other.inner === inner)
      .map(other => other.line)

    // The match starts on the separator before `git`, which the last assignment must end on. A
    // line break separates commands, as `;` does, except after a `\`.
    return [...line.matchAll(WORKTREE_ADD)].map(match => {
      const before = [...earlier, line.slice(0, match.index + 1)].join('\n')

      return expandVariables(match[0], before.replace(/\\\n/g, ' ').replace(/\n/g, ';'))
    })
  })

  return adds.some(add => !THROWAWAY_TARGET.test(add))
}

export const register: Register = on => {
  on('tool.call', { tool: 'Bash' }, ($, e, next) => {
    if (addsPersistentWorktree(e.command)) {
      $.ui.toast('use EnterWorktree, not git worktree add')

      return { deny: DENY_REASON }
    }

    return next(e)
  })
}
