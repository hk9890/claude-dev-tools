import type { Register } from 'claude-code'

const DENY_REASON =
  'This revier command opens, raises or closes a window and takes the focus from the window the user is typing in. Do not run it and do not look for another way to run it: give the user the exact command, and they run it themselves when they are ready.'

// Text the shell does not run, so a commit message, a heredoc or a grep pattern that mentions the
// command passes: a heredoc body, then a comment or a quoted string. An escaped character is
// matched too, so `\'` opens no string.
const HEREDOC_BODY = /((?<!<)<<-?[ \t]*(["']?)([\w-]+)\2.*\n)[\s\S]*?^[ \t]*\3$/gm
const NOT_RUN = /\\(?:\r?\n|[\s\S])|(?<=^|\s)#.*|'[^']*'|"(?:\\[\s\S]|[^"\\])*"/gm
const ESCAPED = /\\[\s\S]/g
const SUBSTITUTION = /\$\(|`/

// `revier` must sit in command position: first on a line or after `;`, `&`, `|`, `(` or a
// backtick, then past any assignment (`A=b revier`), keyword (`do revier`) or wrapper that runs its
// arguments (`timeout 30 revier`). A development build run by path (`./bin/revier`) passes. The
// match ends at a `;`, `&` or `|`, so it holds the arguments of that one command.
const ASSIGNMENT = String.raw`\w+=\S*`
const KEYWORD = String.raw`if|then|elif|else|while|until|do|time|!|\{`
const WRAPPER = String.raw`(?:command|exec|env|nohup|setsid|timeout|xargs|revier\s+each\s+--)(?:\s+(?:-\S+|\d\S*))*`
const LEAD = String.raw`(?:^|[;&|(\`])\s*(?:(?:${ASSIGNMENT}|${KEYWORD}|${WRAPPER})\s+)*`
const SUBCOMMAND = String.raw`(?:open|go|popup|shutdown|agent\s+(?:new|focus)|shell\s+new|session\s+restore)`
const FOCUS_MOVER = new RegExp(String.raw`${LEAD}revier\s+${SUBCOMMAND}(?![\w-])[^;&|]*`, 'g')

// revier reads its flags before it acts: with one of these it prints and changes no window.
const CHANGES_NO_WINDOW = /\s(?:--dry-run|--help|-h)(?![\w=-])/

// A line that ends in `\` continues on the next. A double-quoted string still runs its command
// substitutions, so it stays from the first one on. Its escaped characters are blanked first: an
// escaped `$(` or backtick is text and starts none.
function runnable(command: string) {
  return command.replace(HEREDOC_BODY, '$1').replace(NOT_RUN, text => {
    if (text.startsWith('\\')) {
      return text.endsWith('\n') ? ' ' : text
    }

    if (!text.startsWith('"')) {
      return ' '
    }

    const unescaped = text.replace(ESCAPED, '  ')
    const substitution = unescaped.search(SUBSTITUTION)

    return substitution < 0 ? ' ' : unescaped.slice(substitution)
  })
}

function movesFocus(command: string) {
  const runs = runnable(command)
    .split(/\r?\n/)
    .flatMap(line => line.match(FOCUS_MOVER) ?? [])

  return runs.some(run => !CHANGES_NO_WINDOW.test(run))
}

export const register: Register = on => {
  on('tool.call', { tool: 'Bash' }, ($, e, next) => {
    if (movesFocus(e.command)) {
      $.ui.toast('blocked a command that takes the focus')

      return { deny: DENY_REASON }
    }

    return next(e)
  })
}
