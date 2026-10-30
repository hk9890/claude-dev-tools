import type { Register } from 'claude-code'

const DENY_REASON =
  'Use the EnterWorktree tool for a persistent worktree, not `git worktree add`: it creates the worktree under .claude/worktrees/ and enters it in one step, and ExitWorktree can remove it later. A throwaway probe (`git worktree add --detach <dir> <ref>`) into /tmp or the scratchpad is allowed. If EnterWorktree cannot express what you need, tell the user instead of creating the worktree by hand.'

// `git` must sit in command position, so a commit message or PR body that mentions the command
// passes. Options between `git` and `worktree` (`git -C <dir> worktree add`) still match, but not
// across a `;`, `&` or `|`. An add in a command substitution ends at its `)`.
const GIT_OPTION = String.raw`\s+-[^;&|\s]*(?:\s+[^-;&|\s][^;&|\s]*)?`
const WORKTREE_ADD = new RegExp(
  String.raw`(?:^|[;&|(])\s*git(?:${GIT_OPTION})*\s+worktree\s+add(?:\s[^;&|)]*|$)`,
  'g',
)
const THROWAWAY_TARGET = /\/scratchpad\/|(?:^|[\s"'=])\/tmp\/|mktemp|\$\{?TMPDIR/

// A shell runs the script it reads, and `ssh` and `su` hand theirs to one. A shell is a word of its
// own or the end of a path (`/bin/sh`), not a file name such as `run.sh`. `eval`, `watch` and
// `trap` run a quoted argument too.
const SHELLS = String.raw`bash|sh|zsh|dash|ksh|fish|ssh|su`
const SHELL = new RegExp(String.raw`(?<![\w.-])(?:${SHELLS})(?![\w.-])`)
const RUNS_TEXT = new RegExp(String.raw`(?<![\w.-])(?:${SHELLS}|eval|watch|trap)(?![\w.-])`)

// A heredoc body is text for the command that reads it, except where a shell is on that line,
// outside its quotes.
const HEREDOC = /(?<!<)<<(?!<)(-?)\s*(['"]?)([A-Za-z_]\w*)\2/

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

      if (!SHELL.test(blank(line, () => false).text)) {
        at = closing === -1 ? at : closing
      } else {
        innerUntil = Math.max(innerUntil, closing)
      }
    }
  }

  return run
}

// Spaces in place of text, with its line breaks kept so the lines still split.
const blankText = (text: string) => text.replace(/[^\n]/g, ' ')

// The command with its quoted text and comments blanked, the same length so a match maps back to
// the original, and its lines: a quote, or a `\` at the end of a line, carries a line on into the
// next. Quoted text is text for the command that reads it, except on a line where `runs` holds;
// text that runs starts a command, so its opening quote reads as a `;`. A backtick span runs, and
// so does a `$(...)` span in double quotes; a backtick reads as the `(` or `)` it stands for.
function blank(command: string, runs: (line: number) => boolean) {
  const lines: string[] = []
  let text = ''
  let lineStart = 0
  let quote = ''
  let ansi = false
  let running = false
  let depth = 0
  let backtick = false

  for (let at = 0; at < command.length; at++) {
    const char = command[at] ?? ''
    const pair = command.slice(at, at + 2)
    const code = quote === '' || depth > 0 || backtick

    if (char === '\\' && (code || quote === '"' || ansi)) {
      text += code || running ? pair : blankText(pair)
      at++
    } else if (char === '`' && (code || quote === '"')) {
      text += backtick ? ')' : '('
      backtick = !backtick
    } else if (depth > 0) {
      depth += char === '(' ? 1 : char === ')' ? -1 : 0
      text += char
    } else if (backtick) {
      text += char
    } else if (quote === '"' && pair === '$(') {
      depth = 1
      text += pair
      at++
    } else if (char === quote) {
      quote = ''
      text += char
    } else if (quote !== '') {
      text += running ? char : blankText(char)
    } else if (char === "'" || char === '"') {
      quote = char
      ansi = char === "'" && command[at - 1] === '$'
      running = runs(lines.length)
      text += running ? ';' : char
    } else if (char === '#' && /^$|[\s;&|()<>]/.test(command[at - 1] ?? '')) {
      const comment = command.slice(at).split('\n')[0] ?? ''
      text += blankText(comment)
      at += comment.length - 1
    } else {
      if (char === '\n') {
        lines.push(text.slice(lineStart))
        lineStart = text.length + 1
      }
      text += char
    }
  }

  lines.push(text.slice(lineStart))

  return { text, lines }
}

// Each line with its quoted text and comments blanked. A line runs its quoted text where a command
// that runs text stands outside its quotes, before them or after, as in `echo '...' | sh`.
function blankQuotedText(lines: string[]) {
  const command = lines.join('\n')
  const plain = blank(command, () => false).lines

  return blank(command, line => RUNS_TEXT.test(plain[line] ?? '')).text.split('\n')
}

// Only a whole command sets a variable for the commands after it: `echo W=/tmp/x` and the prefix
// in `W=/tmp/x true` do not, and a subshell's assignment ends with it.
const ASSIGNMENT = /(?:^|;|&&|\|\|)\s*([A-Za-z_]\w*)=("[^"]*"|'[^']*'|[^\s;&|()]*)\s*(?=;|&&|\|\||$)/g
const VARIABLE = /\$(?:\{([A-Za-z_]\w*)\}|([A-Za-z_]\w*))/g

// `W=/tmp/x && git worktree add $W` names its target through a variable: the add takes the value
// of the last assignment before it, on its line or an earlier one of the same shell. A variable
// with no such assignment stays as written. The assignment is found in the blanked text, so quoted
// text sets nothing, and its value is read from the original.
function expandVariables(add: string, before: string, blankedBefore: string) {
  const values = new Map<string, string>()

  for (const { 0: assignment, 1: name = '', 2: value = '', index } of blankedBefore.matchAll(ASSIGNMENT)) {
    const start = index + assignment.indexOf('=') + 1
    values.set(name, before.slice(start, start + value.length).replace(/^(["'])(.*)\1$/, '$2'))
  }

  return add.replace(VARIABLE, (reference, braced, bare) => values.get(braced ?? bare) ?? reference)
}

// A throwaway probe is judged by the arguments of the add itself, not by the rest of the command,
// so each line is matched alone and every add on it must name a throwaway target. The add is found
// in the blanked line, and its target read from the original one.
function addsPersistentWorktree(command: string) {
  const lines = commandLines(command)
  const original = lines.map(({ line }) => line)
  const blanked = blankQuotedText(original)
  const adds = lines.flatMap(({ inner }, at) => {
    const shell = lines.flatMap((other, index) => (index < at && other.inner === inner ? [index] : []))

    // The match starts on the separator before `git`, which the last assignment must end on. A
    // line break separates commands, as `;` does, except after a `\`. Both texts take the same
    // replacements, of the same length, so they stay aligned.
    const before = (texts: string[], end: number) =>
      [...shell.map(index => texts[index] ?? ''), (texts[at] ?? '').slice(0, end)]
        .join('\n')
        .replace(/\\\n/g, '  ')
        .replace(/\n/g, ';')

    return [...(blanked[at] ?? '').matchAll(WORKTREE_ADD)].map(match => {
      const add = (original[at] ?? '').slice(match.index, match.index + match[0].length)

      return expandVariables(add, before(original, match.index + 1), before(blanked, match.index + 1))
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
