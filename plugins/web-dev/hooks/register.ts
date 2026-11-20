import type { Register, ToolCheckResult } from 'claude-code'

const OPENS_WINDOW =
  "This command opens a browser window on the user's screen, and web-dev runs every browser headless. Where a sign-in needs a visible window, give the user the exact `cd <scratch> && playwright-cli -s=<session> open --headed <url>` to run in their own terminal; once they have signed in, `state-save` the state, `close`, and go on headless with `state-load`."
const LIGHTHOUSE_HEADED =
  'This Lighthouse run opens a visible Chrome on the user\'s screen. Run it with `--chrome-flags="--headless=new"` and without `--view`.'
const TEST_WINDOW =
  'This Playwright Test command opens a browser window or its report on the user\'s screen. Run tests as `CI=1 npx playwright test`, without `--ui`, `--headed` or `--debug`, and read a report or a trace from its files.'
const CLOSES_OTHERS =
  'This command stops the browsers of every session on this machine, not only the ones of this session. Close your own browser with `playwright-cli -s=<your session> close`.'
const NO_SESSION =
  'This playwright-cli command names no session, so it acts on the shared default browser, which another session or the user may own. Add `-s=<your session>`.'

// Text the shell does not run, so a commit message, a heredoc or a grep pattern that mentions the
// command passes: a heredoc body, then a comment or a quoted string. An escaped character is
// matched too, so `\'` opens no string. The same parser as revier's guard.
const HEREDOC_BODY = /((?<!<)<<-?[ \t]*(["']?)([\w-]+)\2.*\n)[\s\S]*?^[ \t]*\3$/gm
const NOT_RUN = /\\(?:\r?\n|[\s\S])|(?<=^|\s)#.*|'[^']*'|"(?:\\[\s\S]|[^"\\])*"/gm
const ESCAPED = /\\[\s\S]/g
const SUBSTITUTION = /\$\(|`/

// A quoted string stays one word that starts no command: its quotes go, and its whitespace and
// the shell's separators become FILL. Its text stays, so a quoted flag value can be read.
const FILL = '\u0001'
const QUOTED_SEPARATORS = /[\s;&|(`]/g

// A command sits in command position: first on a line or after `;`, `&`, `|`, `(` or a backtick,
// then past any assignment (`A=b cmd`), keyword (`do cmd`) or wrapper that runs its arguments
// (`timeout 30 cmd`). The match ends at a `;`, `&` or `|`, so it holds the arguments of that one
// command. It is captured in a lookahead: a command substitution in those arguments is a match of
// its own.
const ASSIGNMENT = String.raw`\w+=\S*`
const KEYWORD = String.raw`if|then|elif|else|while|until|do|time|!|\{`
const WRAPPER = String.raw`(?:command|exec|env|nohup|setsid|timeout|xargs)(?:\s+(?:-\S+|\d\S*))*`
const LEAD = String.raw`(?:^|[;&|(\`])\s*(?:(?:${ASSIGNMENT}|${KEYWORD}|${WRAPPER})\s+)*`
const LEADING = new RegExp(String.raw`^[;&|(\`]?\s*(?:(?:${ASSIGNMENT}|${KEYWORD}|${WRAPPER})\s+)*`)

// A tool runs by name, by path, or through a package runner, with or without a version.
const PACKAGE_RUNNER = String.raw`(?:npx|bunx|pnpm\s+(?:dlx|exec)|npm\s+exec|yarn(?:\s+dlx)?)(?:\s+(?:-y|--yes|-p\s+\S+|--package(?:=|\s+)\S+|--))*`
const MISE_RUNNER = String.raw`mise\s+(?:exec|x)(?:\s+(?!--)\S+)*\s+--`
const RUN = String.raw`(?:(?:${PACKAGE_RUNNER}|${MISE_RUNNER})\s+)?`
const PATH = String.raw`(?:[\w.~/\${}-]*/)?`
const VERSION = String.raw`(?:@[\w.^~-]+)?`

const PLAYWRIGHT = String.raw`${RUN}(?:${PATH}playwright-cli${VERSION}|@playwright/cli${VERSION}|${PATH}playwright\s+cli)`
const OPENER = String.raw`${PATH}(?:xdg-open|x-www-browser|www-browser|sensible-browser|gio\s+open|python3?\s+-m\s+webbrowser)`
const TEST_RUNNER = String.raw`${RUN}${PATH}playwright${VERSION}`
const DEVTOOLS = String.raw`${RUN}${PATH}chrome-devtools${VERSION}`
const LIGHTHOUSE = String.raw`${RUN}${PATH}lighthouse${VERSION}`
const WATCHED = new RegExp(String.raw`(?=(${LEAD}(?:${PLAYWRIGHT}|${TEST_RUNNER}|${OPENER}|${DEVTOOLS}|${LIGHTHOUSE})(?![\w-])[^;&|]*))`, 'g')
const anchored = (tool: string) => new RegExp(String.raw`^${tool}(?![\w-])`)
const IS_OPENER = anchored(OPENER)
const IS_DEVTOOLS = anchored(DEVTOOLS)
const IS_LIGHTHOUSE = anchored(LIGHTHOUSE)
const IS_PLAYWRIGHT = anchored(PLAYWRIGHT)
const IS_TEST_RUNNER = anchored(TEST_RUNNER)

// Playwright Test subcommands that always open a window, and the test flags that do. A config
// commonly runs headless only where CI is set, so a test run needs CI in its assignments.
const TEST_WINDOW_SUBCOMMANDS = new Set(['show-report', 'show-trace', 'codegen', 'open', 'cr', 'ff', 'wk'])
const TEST_WINDOW_FLAG = /^--(?:ui|headed|debug)(?:=(?!false$).*)?$/
const SETS_CI = /(?:^|\s)CI=(?!(?:0|false)?(?:\s|$))\S/

// --extension, --cdp and --endpoint drive a browser that already runs, the user's too.
const HEADED = /^--(?:headed(?:=(?!false$).*)?|extension(?:=.*)?|cdp(?:=.*)?|endpoint(?:=.*)?)$/
const WINDOW_SUBCOMMANDS = new Set(['show'])
const ALL_SESSIONS_SUBCOMMANDS = new Set(['close-all', 'kill-all'])
// Subcommands that act on no browser session.
const SESSION_FREE_SUBCOMMANDS = new Set(['', 'list', 'install', 'install-browser', 'attach'])
// A session flag whose name is the next word: `-s claude-s1`.
const SESSION_FLAG = /^(?:-s|--session)$/
const NAMES_SESSION = /^(?:-s|--session)(?:=|$)/
const HELP = /^(?:--help|-h|--version)$/

// --autoConnect, --browserUrl and --wsEndpoint drive a browser that already runs, the user's too.
// The CLI takes each flag in camel case and in kebab case.
const VISIBLE_DEVTOOLS =
  /\s(?:--(?:no-headless|headless(?:=|\s+)false|(?:autoConnect|auto-connect)(?!=false)|browserUrl|browser-url|wsEndpoint|ws-endpoint)|-[uw])(?![\w-])/

// A line that ends in `\` continues on the next. A double-quoted string still runs its command
// substitutions, so it stays from the first one on. Its escaped characters are blanked first: an
// escaped `$(` or backtick is text and starts none.
function runnable(command: string) {
  return command.replace(HEREDOC_BODY, '$1').replace(NOT_RUN, text => {
    if (text.startsWith('\\')) {
      return text.endsWith('\n') ? ' ' : text
    }

    if (text.startsWith('#')) {
      return ' '
    }

    const quoted = text.slice(1, -1).replace(QUOTED_SEPARATORS, FILL)

    if (text.startsWith("'")) {
      return quoted
    }

    const unescaped = text.replace(ESCAPED, '  ')
    const substitution = unescaped.search(SUBSTITUTION)

    return substitution < 0 ? quoted : unescaped.slice(substitution)
  })
}

// Lighthouse launches a visible Chrome unless its --chrome-flags value says headless, and --view
// opens its report in the user's browser; --version and --help launch nothing.
function opensLighthouseWindow(words: string) {
  if (/\s--view(?!=false)(?![\w-])/.test(words)) {
    return true
  }

  return !/\s--(?:version|help)(?![\w-])/.test(words) && !/\s--chrome-flags(?:=|\s+)\S*--headless(?!=false)(?![\w-])/.test(words)
}

function testRunnerRefusal(run: string, words: string) {
  const args = words.replace(IS_TEST_RUNNER, '').trim().split(/\s+/).filter(Boolean)
  const subcommand = args.find(arg => !arg.startsWith('-')) ?? ''

  if (TEST_WINDOW_SUBCOMMANDS.has(subcommand) || args.some(arg => TEST_WINDOW_FLAG.test(arg))) {
    return TEST_WINDOW
  }

  return subcommand === 'test' && !SETS_CI.test(run) ? TEST_WINDOW : undefined
}

function playwrightRefusal(run: string, words: string) {
  const args = words.replace(IS_PLAYWRIGHT, '').trim().split(/\s+/).filter(Boolean)
  const subcommand = args.find((arg, i) => !arg.startsWith('-') && !SESSION_FLAG.test(args[i - 1] ?? '')) ?? ''

  if (ALL_SESSIONS_SUBCOMMANDS.has(subcommand)) {
    return CLOSES_OTHERS
  }

  if (WINDOW_SUBCOMMANDS.has(subcommand) || args.some(arg => HEADED.test(arg))) {
    return OPENS_WINDOW
  }

  const namesSession = args.some(arg => NAMES_SESSION.test(arg)) || /(?:^|\s)PLAYWRIGHT_CLI_SESSION=\S/.test(run)

  return namesSession || SESSION_FREE_SUBCOMMANDS.has(subcommand) || args.some(arg => HELP.test(arg)) ? undefined : NO_SESSION
}

// The deny reason for one command, or undefined where it opens no window and touches no other
// session's browser.
function refusal(run: string) {
  const words = run.replace(LEADING, '').trim()

  if (IS_OPENER.test(words)) {
    return OPENS_WINDOW
  }

  if (IS_DEVTOOLS.test(words)) {
    return VISIBLE_DEVTOOLS.test(words) ? OPENS_WINDOW : undefined
  }

  if (IS_LIGHTHOUSE.test(words)) {
    return opensLighthouseWindow(words) ? LIGHTHOUSE_HEADED : undefined
  }

  if (!IS_PLAYWRIGHT.test(words) && IS_TEST_RUNNER.test(words)) {
    return testRunnerRefusal(run, words)
  }

  return playwrightRefusal(run, words)
}

function refusalOf(command: string) {
  return runnable(command)
    .split(/\r?\n/)
    .flatMap(line => Array.from(line.matchAll(WATCHED), ([, run = '']) => refusal(run)))
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
