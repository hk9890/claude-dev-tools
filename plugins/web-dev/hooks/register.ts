import type { Register, ToolCheckResult } from 'claude-code'

const OPENS_WINDOW =
  "This command opens a browser window on the user's screen, and web-dev runs every browser headless. Where a sign-in needs a visible window, give the user the exact command to run in their own terminal, then go on headless with the state it saved."
const CLOSES_OTHERS =
  'This command stops the browsers of every session on this machine, not only the ones of this session. Close your own browser with `playwright-cli -s=<your session> close`.'

// Text the shell does not run, so a commit message, a heredoc or a grep pattern that mentions the
// command passes: a heredoc body, then a comment or a quoted string. An escaped character is
// matched too, so `\'` opens no string. The same parser as revier's guard.
const HEREDOC_BODY = /((?<!<)<<-?[ \t]*(["']?)([\w-]+)\2.*\n)[\s\S]*?^[ \t]*\3$/gm
const NOT_RUN = /\\(?:\r?\n|[\s\S])|(?<=^|\s)#.*|'[^']*'|"(?:\\[\s\S]|[^"\\])*"/gm
const ESCAPED = /\\[\s\S]/g
const SUBSTITUTION = /\$\(|`/

// A command sits in command position: first on a line or after `;`, `&`, `|`, `(` or a backtick,
// then past any assignment (`A=b cmd`), keyword (`do cmd`) or wrapper that runs its arguments
// (`timeout 30 cmd`). The match ends at a `;`, `&` or `|`, so it holds the arguments of that one
// command. It is captured in a lookahead: a command substitution in those arguments is a match of
// its own.
const ASSIGNMENT = String.raw`\w+=\S*`
const KEYWORD = String.raw`if|then|elif|else|while|until|do|time|!|\{`
const WRAPPER = String.raw`(?:command|exec|env|nohup|setsid|timeout|xargs)(?:\s+(?:-\S+|\d\S*))*`
const LEAD = String.raw`(?:^|[;&|(\`])\s*(?:(?:${ASSIGNMENT}|${KEYWORD}|${WRAPPER})\s+)*`
const PLAYWRIGHT = String.raw`(?:playwright-cli|npx\s+(?:(?:-y|--yes)\s+)?(?:@playwright/cli|playwright\s+cli))`
const OPENER = String.raw`(?:xdg-open|gio\s+open|sensible-browser)`
const DEVTOOLS = 'chrome-devtools'
const LIGHTHOUSE = 'lighthouse'
const WATCHED = new RegExp(String.raw`(?=(${LEAD}(?:${PLAYWRIGHT}|${OPENER}|${DEVTOOLS}|${LIGHTHOUSE})(?![\w-])[^;&|]*))`, 'g')
const LEADING = new RegExp(String.raw`^[;&|(\`]?\s*(?:(?:${ASSIGNMENT}|${KEYWORD}|${WRAPPER})\s+)*`)

// --extension and --cdp drive a browser the user runs, in front of them.
const HEADED = /^--(?:headed(?:=(?!false$).*)?|extension(?:=.*)?|cdp(?:=.*)?)$/
const WINDOW_SUBCOMMANDS = new Set(['show'])
const ALL_SESSIONS_SUBCOMMANDS = new Set(['close-all', 'kill-all'])
const VISIBLE_DEVTOOLS = /\s--(?:no-headless|headless(?:=|\s+)false|autoConnect(?!=false))(?![\w-])/

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

// The deny reason for one command of the raw command line, or undefined where it opens no window
// and stops no other session's browser.
function refusal(run: string, raw: string) {
  const words = run.replace(LEADING, '').trim()

  if (new RegExp(`^${OPENER}(?![\\w-])`).test(words)) {
    return OPENS_WINDOW
  }

  if (words.startsWith(DEVTOOLS)) {
    return VISIBLE_DEVTOOLS.test(words) ? OPENS_WINDOW : undefined
  }

  // Lighthouse launches a visible Chrome unless its Chrome flags say headless; `--version` and
  // `--help` launch none. A flag inside quotes was blanked as text, so the raw run is read.
  if (words.startsWith(LIGHTHOUSE)) {
    return /--headless|--version|--help/.test(raw) ? undefined : OPENS_WINDOW
  }

  const args = words.replace(new RegExp(`^${PLAYWRIGHT}`), '').trim().split(/\s+/)
  const subcommand = args.find(arg => !arg.startsWith('-')) ?? ''

  if (ALL_SESSIONS_SUBCOMMANDS.has(subcommand)) {
    return CLOSES_OTHERS
  }

  return WINDOW_SUBCOMMANDS.has(subcommand) || args.some(arg => HEADED.test(arg)) ? OPENS_WINDOW : undefined
}

function refusalOf(command: string) {
  return runnable(command)
    .split(/\r?\n/)
    .flatMap(line => Array.from(line.matchAll(WATCHED), ([, run = '']) => refusal(run, command)))
    .find(reason => reason !== undefined)
}

// The mode's own question, which the mod may answer; one from a rule, a hook or a setting of the
// user stays theirs.
const isModeAsk = (verdict: ToolCheckResult) => verdict.decision === 'ask' && !verdict.rule && !verdict.hook && !verdict.setting

export const register: Register = on => {
  on('tool.call', { tool: ['Bash', 'Monitor'] }, ($, e, next) => {
    const reason = refusalOf(e.command ?? '')

    if (reason) {
      $.ui.toast('blocked a command that opens a browser window or stops other browsers')

      return { deny: reason }
    }

    return next(e)
  })

  // The skill's allowed-tools make the engine ask before it loads the skill, and in the default
  // mode of a headless run nobody can answer, so the skill never loads.
  on('tool.check', { tool: 'Skill' }, async ($, e, next) => {
    const verdict = await next(e)
    const { skill } = e.input as { skill?: string }

    return isModeAsk(verdict) && skill === 'web-dev:web-drive' ? { decision: 'allow' } : verdict
  }).catch(($, e, next) => next(e))
}
