import type { Register } from 'claude-code'

const DENY_REASON =
  'Use the EnterWorktree tool for a persistent worktree, not `git worktree add`: it creates the worktree under .claude/worktrees/ and enters it in one step, and ExitWorktree can remove it later. A throwaway probe (`git worktree add --detach <dir> <ref>`) into /tmp or the scratchpad is allowed. For a repository other than the one this session runs in, give its absolute path: `git -C <repo> worktree add <dir> -b <branch>` is allowed. If EnterWorktree cannot express what you need, tell the user instead of creating the worktree by hand. Where the command only mentions `git worktree add` in text, such as a prompt or a commit message, write that text to a file with the Write tool and pass the file in its place (`git commit -F <file>`, `claude -p < <file>`). A script that runs the add still makes a persistent worktree.'

// A shell is a word of its own or the end of a path (`/bin/sh`), not a file name such as `run.sh`.
const SHELL = /(?<![\w.-])(?:bash|sh|zsh)(?![\w.-])/
const QUOTED = /'[^']*'|"(?:\\[\s\S]|[^"\\])*"/g
const HEREDOC = /^<<(-?)[ \t]*(['"]?)([A-Za-z_]\w*)\2/

// How the shell reads each character of the command, and which shell runs it. Text that runs
// nothing reads as `_` where it is a quoted word, so it stays one word, and as blanks where it is a
// comment, a heredoc body or its closing line; a `\` escapes the next character. A subshell, a
// command substitution, and a heredoc body or quoted text that a shell named on its line reads,
// each run in a shell of their own. A `<<` with no closing line is not a heredoc.
function runnable(command: string) {
  const read = command.split('')
  const shell = read.map(() => 0)
  let shells = 0

  const mask = (from: number, to: number, id: number, as: string) => {
    shell.fill(id, from, to)
    read.fill(as, from, to)
  }

  const shellReads = (at: number) => {
    const end = command.indexOf('\n', at)
    const line = command.slice(command.lastIndexOf('\n', at - 1) + 1, end < 0 ? undefined : end)

    return SHELL.test(line.replace(QUOTED, ' '))
  }

  const heredoc = (at: number) => {
    const [, dash, , word] = command.slice(at).match(HEREDOC) ?? []
    const closing = new RegExp(`^${dash ? '\\t*' : ''}${word}$`, 'gm')
    closing.lastIndex = command.indexOf('\n', at) + 1
    const line = word !== undefined && closing.lastIndex > 0 ? closing.exec(command) : null

    return line ? { shell: shellReads(at), start: closing.lastIndex - line[0].length, end: closing.lastIndex } : null
  }

  // A double-quoted string is one word, but the command substitutions in it run.
  const doubleQuoted = (at: number, id: number) => {
    mask(at, at + 1, id, '_')

    for (at++; at < command.length && command[at] !== '"'; at++) {
      const open = command.startsWith('$(', at) ? 2 : command[at] === '`' ? 1 : 0
      mask(at, at + (command[at] === '\\' ? 2 : open || 1), id, '_')

      if (command[at] === '\\') {
        at++
      } else if (open > 0) {
        at = scan(at + open, open === 1 ? '`' : ')')
        mask(at, at + 1, id, '_')
      }
    }

    mask(at, at + 1, id, '_')

    return at
  }

  // Reads one shell from `from` to its closing character or offset, and returns where it stopped.
  function scan(from: number, close: string | number): number {
    const id = shells++
    let body: ReturnType<typeof heredoc> = null
    let at = from

    for (; at < command.length && at !== close; at++) {
      const c = command[at] ?? ''
      shell[at] = id

      if (c === close) {
        return at
      } else if (c === '\\') {
        mask(at, at + 2, id, command[at + 1] === '\n' ? ' ' : '_')
        at++
      } else if (c === '#' && (at === 0 || /[\s;&|(]/.test(command[at - 1] ?? ''))) {
        const end = command.indexOf('\n', at)
        mask(at, end < 0 ? command.length : end, id, ' ')
        at = (end < 0 ? command.length : end) - 1
      } else if ((c === "'" || c === '"') && shellReads(at)) {
        mask(at, at + 1, id, '_')
        at = scan(at + 1, c)
        mask(at, at + 1, id, '_')
      } else if (c === "'") {
        const end = command.indexOf("'", at + 1)
        mask(at, end < 0 ? command.length : end + 1, id, '_')
        at = end < 0 ? command.length : end
      } else if (c === '"') {
        at = doubleQuoted(at, id)
      } else if (c === '(' || c === '`') {
        at = scan(at + 1, c === '(' ? ')' : '`')
        shell.fill(id, at, at + 1)
      } else if (c === '<' && command[at - 1] !== '<' && command[at + 2] !== '<' && body === null) {
        body = heredoc(at)
      } else if (c === '\n' && body !== null) {
        if (body.shell) {
          scan(at + 1, body.start)
        } else {
          mask(at + 1, body.start, id, ' ')
        }

        mask(body.start, body.end, id, ' ')
        at = body.end - 1
        body = null
      }
    }

    return at
  }

  scan(0, '')

  return { read, shell }
}

// What one shell runs, as the matchers read it: its own characters, a nested shell's as `_`, so
// `$(...)` stays one word, and the rest as line breaks.
function view({ read, shell }: ReturnType<typeof runnable>, id: number) {
  const [first, last] = [shell.indexOf(id), shell.lastIndexOf(id)]

  return read.map((c, at) => (shell[at] === id ? c : at > first && at < last ? '_' : '\n')).join('')
}

// `git` must sit in command position, so a commit message or PR body that mentions the command
// passes. Options between `git` and `worktree` (`git -C <dir> worktree add`) still match, but not
// across a `;`, `&` or `|`.
const GIT_OPTION = String.raw`\s+-[^;&|\s]*(?:\s+[^-;&|\s][^;&|\s]*)?`
const WORKTREE_ADD = new RegExp(
  String.raw`(?<=(?:^|[;&|\n])\s*)git(?<options>(?:${GIT_OPTION})*)\s+worktree\s+add(?<args>(?![^\s;&|])[^;&|\n]*)`,
  'dg',
)

// Only a whole command, run in the same shell before the add, sets a variable for it or changes
// its directory: not `echo W=/tmp/x`, the prefix in `W=/tmp/x true`, a background job or a
// pipeline. Where the last `cd`, `pushd` or `popd` before the add is not such a `cd <dir>`, the
// add's directory is unknown.
const AFTER = String.raw`(?:^|[;\n]|&&|\|\|)\s*`
const BEFORE = String.raw`\s*(?:[;\n]|&&|\|\||$)`
const ASSIGNMENT = new RegExp(String.raw`(?<=${AFTER})([A-Za-z_]\w*)=([^\s;&|]*)(?=${BEFORE})`, 'dg')
const DIRECTORY_CHANGE = /(?<![\w./$-])(?:cd|pushd|popd)(?![\w./-])/g
const CD = new RegExp(String.raw`(?<=${AFTER})cd\s+([^\s;&|]+)(?=${BEFORE})`, 'dy')
const VARIABLE = /\$(?:\{([A-Za-z_]\w*)\}|([A-Za-z_]\w*))/g

const THROWAWAY_TARGET = /^(?:\/tmp\/|\$\{?TMPDIR\b|\$\(mktemp\b)|\/scratchpad\//

// The <path> of `git worktree add [<option>...] <path> [<commit-ish>]`: its first word that is
// not an option, the value of `-b`, `-B` or `--reason`, or a redirect.
function targetPath(args: string[]) {
  for (let at = 0; at < args.length; at++) {
    const word = args[at] ?? ''

    if (word === '--' || /^(?:-[bB]|--reason|\d*[<>]+&?)$/.test(word)) {
      at += word === '--' ? 0 : 1
    } else if (!/^(?:-|\d*[<>])/.test(word) || args[at - 1] === '--') {
      return word
    }
  }

  return undefined
}

// Each add of a persistent worktree yields the directory it runs in, where the command names one:
// the add's last `git -C <dir>`, else its `cd <dir>`. `--git-dir` and `--work-tree` name none.
function persistentAdds(command: string) {
  // The scan is slow on a long command, and most commands never name a worktree.
  if (!command.includes('worktree')) {
    return []
  }

  const shells = runnable(command)

  return [...new Set(shells.shell)].flatMap(id => {
    const text = view(shells, id)

    return [...text.matchAll(WORKTREE_ADD)].flatMap(add => {
      const before = text.slice(0, add.index)
      const values = new Map<string, string>()
      const word = ([from, to]: [number, number]) =>
        command
          .slice(from, to)
          .replace(/\\([\s\S])|["']/g, '$1')
          .replace(VARIABLE, (reference, braced, bare) => values.get(braced ?? bare) ?? reference)
      const words = ([from, to]: [number, number]) =>
        [...text.slice(from, to).matchAll(/\S+/g)].map(w => word([from + w.index, from + w.index + w[0].length]))

      for (const assignment of before.matchAll(ASSIGNMENT)) {
        values.set(assignment[1] ?? '', word(assignment.indices?.[2] ?? [0, 0]))
      }

      const [options = [0, 0], args = [0, 0]] = [add.indices?.groups?.options, add.indices?.groups?.args]
      const optionWords = words(options)
      const path = targetPath(words(args))

      if (path !== undefined && THROWAWAY_TARGET.test(path)) {
        return []
      }

      const dashC = optionWords.lastIndexOf('-C')
      CD.lastIndex = [...before.matchAll(DIRECTORY_CHANGE)].at(-1)?.index ?? before.length
      const cd = CD.exec(before)?.indices?.[1]
      const dir = dashC >= 0 ? optionWords[dashC + 1] : cd && word(cd)

      return [optionWords.some(option => /^--(?:git-dir|work-tree)\b/.test(option)) ? undefined : dir]
    })
  })
}

// EnterWorktree covers the session's own repository only. An add belongs to it unless it names an
// absolute directory, with no `.` or `..` part and no value the shell computes, outside the
// repository's root; with no repository, any such name is outside.
function inSessionRepo(dir: string | undefined, root: string | undefined, home: string | undefined) {
  if (dir === undefined) {
    return true
  }

  const path = `${dir.replace(/^(?:~|\$\{?HOME\}?)(?=\/|$)/, home ?? '$&')}/`.replace(/\/+/g, '/')

  return (
    !path.startsWith('/') ||
    /\/\.\.?\/|[$`]/.test(path) ||
    (root !== undefined && path.startsWith(`${root}/`))
  )
}

// Where the guard fails before the call runs, as where the repository or HOME cannot be read, a
// command that may add a worktree is denied.
export const register: Register = on => {
  on('tool.call', { tool: ['Bash', 'Monitor'] }, async ($, e, next) => {
    const dirs = persistentAdds(e.command ?? '')
    const [repo, home] = dirs.length > 0 ? await Promise.all([$.session.repo(), $.env.get('HOME')]) : []

    if (dirs.some(dir => inSessionRepo(dir, repo?.root, home))) {
      $.ui.toast('use EnterWorktree, not git worktree add')

      return { deny: DENY_REASON }
    }

    return next(e)
  }).catch(($, e, next) => (next.called || !/worktree\s+add/.test(e.command ?? '') ? next(e) : { deny: DENY_REASON }))
}
