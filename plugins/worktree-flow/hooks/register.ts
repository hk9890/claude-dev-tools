import type { Register } from 'claude-code'

const DENY_REASON =
  'Use the EnterWorktree tool for a persistent worktree, not `git worktree add`: it creates the worktree under .claude/worktrees/ and enters it in one step, and ExitWorktree can remove it later. A throwaway probe (`git worktree add --detach <dir> <ref>`) into /tmp or the scratchpad is allowed. For a repository other than the one this session runs in, give its absolute path: `git -C <repo> worktree add <dir> -b <branch>` is allowed. If EnterWorktree cannot express what you need, tell the user instead of creating the worktree by hand. Where the command only mentions `git worktree add` in text, such as a prompt or a commit message, write that text to a file with the Write tool and pass the file in its place (`git commit -F <file>`, `claude -p < <file>`). This check can refuse an echo or printf of that text too. A script that runs the add still makes a persistent worktree.'

// Claude Code refuses a Bash call in a worktree-isolated session or agent where it cannot prove
// that git stays in the worktree; its refusal names the reason but not the form that runs.
const ISOLATION_REFUSAL = /^This (?:session|agent) is isolated in the worktree /
const ISOLATION_FORMS = [
  'worktree-flow: Forms the isolation check accepts:',
  '- Run git as a plain command of its own with literal arguments, not in `$(...)`, a loop, `xargs`, `bash -c` or `python3 -c`. Bash already runs in the worktree, so drop any `cd` or `-C` to it. To use the output of git, read it and write the value into the next call.',
  '- Double-quote each variable (`"$f"`), put `--` before a glob (`rg x -- *.md`), and write computed numbers out (`sed -n 3,9p`, not `$((l+3))`).',
  '- Put file content, a multi-line script or a long text argument in a file with the Write tool, then run or pass the file (`python3 <file>`, `git commit -F <file>`).',
  '- For an exit code, redirect to a file (`cmd > <file> 2>&1; echo "exit=$?"`), not `${PIPESTATUS[...]}` or `${pipestatus[...]}`.',
].join('\n')

// `git` must sit in command position, so a commit message or PR body that mentions the command
// passes. Options between `git` and `worktree` (`git -C <dir> worktree add`) still match, but not
// across a `;`, `&` or `|`.
const GIT_OPTION = String.raw`\s+-[^;&|\s]*(?:\s+[^-;&|\s][^;&|\s]*)?`
const WORKTREE_ADD = new RegExp(
  String.raw`(?:^|[;&|(])\s*git(?:${GIT_OPTION})*\s+worktree\s+add(?:\s[^;&|]*|$)`,
  'g',
)
const THROWAWAY_TARGET = /\/scratchpad\/|(?:^|[\s"'=])\/tmp\/|mktemp|\$\{?TMPDIR/
// A redirect names where the output goes, not the worktree: `> /tmp/wt.log` is no throwaway target.
const REDIRECT = /(?:\d|&)?>>?&?\s*(?:"[^"]*"|'[^']*'|[^\s"']+)/g

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

// The directory an add runs in, where the command names one: the add's last `git -C <dir>`, else
// the last `cd <dir>` before it, outside parentheses. `--git-dir` and `--work-tree` name none.
const WORD = String.raw`((?:"[^"]*"|'[^']*'|[^\s;&|()"'])+)`
const CD = new RegExp(String.raw`(?:^|[;&|])\s*cd\s+` + WORD, 'g')
const DASH_C = new RegExp(String.raw`\s-C\s+` + WORD, 'g')

function namedDirectory(add: string, before: string) {
  const options = add.slice(0, add.search(/\sworktree\s+add/))
  const word = [...before.matchAll(CD), ...options.matchAll(DASH_C)].at(-1)?.[1]

  return /\s--(?:git-dir|work-tree)\b/.test(options) ? undefined : word?.replace(/["']/g, '')
}

// A throwaway probe is judged by the arguments of the add itself, not by the rest of the command,
// so each line is matched alone. Each other add yields the directory it names, if any.
function persistentAdds(command: string) {
  const lines = commandLines(command)

  return lines.flatMap(({ line, inner }, at) => {
    const earlier = lines
      .slice(0, at)
      .filter(other => other.inner === inner)
      .map(other => other.line)

    // The match starts on the separator before `git`, which the last assignment must end on. A
    // line break separates commands, as `;` does, except after a `\`.
    return [...line.matchAll(WORKTREE_ADD)].flatMap(match => {
      const before = [...earlier, line.slice(0, match.index + 1)]
        .join('\n')
        .replace(/\\\n/g, ' ')
        .replace(/\n/g, ';')
      const add = expandVariables(match[0], before)

      return THROWAWAY_TARGET.test(add.replace(REDIRECT, '')) ? [] : [namedDirectory(add, before)]
    })
  })
}

// EnterWorktree covers the session's own repository only. An add belongs to it unless it names an
// absolute directory, with no `.` or `..` part, outside the repository's root; with no repository,
// any such name is outside.
function inSessionRepo(dir: string | undefined, root: string | undefined, home: string | undefined) {
  if (dir === undefined) {
    return true
  }

  const path = `${dir.replace(/^(?:~|\$\{?HOME\}?)(?=\/|$)/, home ?? '$&')}/`.replace(/\/+/g, '/')

  return !path.startsWith('/') || /\/\.\.?\//.test(path) || (root !== undefined && path.startsWith(`${root}/`))
}

export const register: Register = on => {
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const dirs = persistentAdds(e.command)

    // Where the repository or HOME cannot be read, the add counts as one into the session's own.
    const ownRepo =
      dirs.length > 0 &&
      (await Promise.all([$.session.repo(), $.env.get('HOME')])
        .then(([repo, home]) => dirs.some(dir => inSessionRepo(dir, repo?.root, home)))
        .catch(() => true))

    if (ownRepo) {
      $.ui.toast('use EnterWorktree, not git worktree add')

      return { deny: DENY_REASON }
    }

    const answer = await next(e)

    if (answer.isError && ISOLATION_REFUSAL.test(answer.text ?? '')) {
      return { ...answer, context: [...(answer.context ?? []), ISOLATION_FORMS] }
    }

    return answer
  })
}
