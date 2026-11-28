import type { Register, ToolCheckResult } from 'claude-code'

const OPENS_WINDOW =
  "This command opens a browser window on the user's screen, and web-dev runs every browser headless. Where a sign-in needs a visible window, give the user the exact `cd <scratch> && playwright-cli -s=<session> open --headed <url>` to run in their own terminal, and tell them to leave the window open until you have saved the state; once they have signed in, `state-save` the state, `close`, and go on headless with `state-load`."
const DEVTOOLS_WINDOW =
  'This chrome-devtools command opens a visible Chrome on the user\'s screen, or attaches to one that runs. Start it as `chrome-devtools start --headless --isolated --performanceCrux=false`.'
const BROWSER_WINDOW =
  'This command opens a browser window on the user\'s screen. Start the browser with `--headless=new`, or drive the page with playwright-cli.'
const LIGHTHOUSE_HEADED =
  'This Lighthouse run opens a visible Chrome on the user\'s screen. Run it with `--chrome-flags="--headless=new"` (with `=`) and without `--view`.'
const TEST_WINDOW =
  'This Playwright Test command opens a browser window or its report on the user\'s screen. Run tests as `CI=1 npx playwright test`, without `--ui`, `--headed` or `--debug`, and read a report or a trace from its files.'
const LIGHTHOUSE_ATTACH =
  'This Lighthouse run attaches to a Chrome that already runs, which may be the user\'s own. Drop `--port` and `--hostname`, so Lighthouse starts its own headless Chrome.'
const CLOSES_OTHERS =
  'This command stops the browsers of every session on this machine, not only the ones of this session. Close your own browser with `playwright-cli -s=<your session> close`.'
const NO_SESSION =
  'This playwright-cli command names no session, so it acts on the shared default browser, which another session or the user may own. Add `-s=<your session>`.'

// The guard is best effort, not complete: it reads the command line as written. A command that
// another program runs passes, such as `bash -c '...'`, `sh -c '...'`, `eval`, a heredoc fed to a
// shell, or a wrapper not in WRAPPER (`nice`, `stdbuf`, `flock`, `watch`). So does a package runner
// with an option that takes a value (`pnpm --filter web exec`, `npm --prefix web exec`, `yarn
// workspace web`), and an `export` in an earlier command is not seen.

// Copied from revier's guard (plugins/revier/hooks/register.ts), which names this copy:
// HEREDOC_BODY, NOT_RUN, ESCAPED, SUBSTITUTION, ASSIGNMENT, KEYWORD and the shape of LEAD. A change
// to them in one is a change to both. revier blanks a quoted string; this guard keeps its text.
//
// Text the shell does not run, so a commit message, a heredoc or a grep pattern that mentions the
// command passes: a heredoc body, then a comment or a quoted string. An escaped character is
// matched too, so `\'` opens no string.
const HEREDOC_BODY = /((?<!<)<<-?[ \t]*(["']?)([\w-]+)\2.*\n)[\s\S]*?^[ \t]*\3$/gm
const NOT_RUN = /\\(?:\r?\n|[\s\S])|(?<=^|\s)#.*|'[^']*'|"(?:\\[\s\S]|[^"\\])*"/gm
const ESCAPED = /\\[\s\S]/g
const SUBSTITUTION = /\$\(|`/

// A quoted string stays one word that starts no command: its quotes become QUOTED in front, and
// its whitespace and the shell's separators become FILL. Its text stays, so a quoted flag value
// can be read, and a quoted word is never a flag of its own.
const FILL = '\u0001'
const QUOTED = '\u0002'
const QUOTED_SEPARATORS = /[\s;&|()`]/g

// A command sits in command position: first on a line or after `;`, `&`, `|`, `(` or a backtick,
// then past any assignment (`A=b cmd`), keyword (`do cmd`) or wrapper that runs its arguments
// (`timeout 30 cmd`). The match ends at a `;`, `&` or `|`, so it holds the arguments of that one
// command. It is captured in a lookahead: a command substitution in those arguments is a match of
// its own, and refusal() reads the arguments without it.
const ASSIGNMENT = String.raw`\w+=\S*`
const KEYWORD = String.raw`if|then|elif|else|while|until|do|time|!|\{`
const WRAPPER = String.raw`(?:command(?!\s+-[vV])|exec|env|nohup|setsid|timeout|xargs)(?:\s+(?:-\S+|\d\S*))*`
const LEAD = String.raw`(?:^|[;&|(\`])\s*(?:(?:${ASSIGNMENT}|${KEYWORD}|${WRAPPER})\s+)*`
const LEADING = new RegExp(String.raw`^[;&|(\`]?\s*(?:(?:${ASSIGNMENT}|${KEYWORD}|${WRAPPER})\s+)*`)

// A tool runs by name, by path, or through a package runner, with or without a version.
const PACKAGE_RUNNER = String.raw`(?:npx|bunx|bun\s+x|pnpm(?:\s+(?:dlx|exec))?|npm\s+(?:exec|x)|yarn(?:\s+dlx)?)(?:\s+(?:-p\s+[^-\s]\S*|-\S+))*`
const MISE_RUNNER = String.raw`mise\s+(?:exec|x)(?:\s+(?!--)\S+)*\s+--`
const RUN = String.raw`(?:(?:${PACKAGE_RUNNER}|${MISE_RUNNER})\s+)?`
const PATH = String.raw`(?:[\w.~/\${}-]*/)?`
const VERSION = String.raw`(?:@[\w.^~-]+)?`

const PLAYWRIGHT = String.raw`${RUN}(?:${PATH}playwright-cli${VERSION}|@playwright/cli${VERSION}|${PATH}playwright\s+cli)`
const OPENER = String.raw`${PATH}(?:xdg-open|wslview|x-www-browser|www-browser|sensible-browser|gio\s+open|python3?\s+-m\s+webbrowser)`
// A browser started by hand opens a window unless it runs headless; macOS `open` opens a URL or a
// page in the user's browser.
const BROWSER = String.raw`${PATH}(?:google-chrome(?:-stable|-beta|-unstable)?|chromium(?:-browser)?|chrome|firefox|microsoft-edge(?:-stable)?|brave-browser)`
const MAC_OPEN = String.raw`${PATH}open`
const TEST_RUNNER = String.raw`${RUN}(?:${PATH}playwright${VERSION}|@playwright/test${VERSION})`
const DEVTOOLS = String.raw`${RUN}${PATH}chrome-devtools${VERSION}`
const LIGHTHOUSE = String.raw`${RUN}${PATH}lighthouse${VERSION}`
const WATCHED = new RegExp(String.raw`(?=(${LEAD}(?:${PLAYWRIGHT}|${TEST_RUNNER}|${OPENER}|${BROWSER}|${MAC_OPEN}|${DEVTOOLS}|${LIGHTHOUSE})(?![\w./-])[^;&|]*))`, 'g')
const anchored = (tool: string) => new RegExp(String.raw`^${tool}(?![\w./-])`)
const IS_OPENER = anchored(OPENER)
const IS_BROWSER = anchored(BROWSER)
const IS_MAC_OPEN = anchored(MAC_OPEN)
const IS_DEVTOOLS = anchored(DEVTOOLS)
const IS_LIGHTHOUSE = anchored(LIGHTHOUSE)
const IS_PLAYWRIGHT = anchored(PLAYWRIGHT)
const IS_TEST_RUNNER = anchored(TEST_RUNNER)

// Playwright Test subcommands that always open a window, and the test flags that do. A config
// commonly runs headless only where CI is set, so a test run needs CI in its assignments.
const TEST_WINDOW_SUBCOMMANDS = new Set(['show-report', 'show-trace', 'codegen', 'open', 'cr', 'ff', 'wk'])
// --debug=cli opens no window: the playwright-cli guide attaches to it.
const TEST_WINDOW_FLAG = /^--(?:ui(?:-host|-port)?|headed|debug)(?:=(?!false$|cli$).*)?$/
const ASSIGNS = (name: string) => new RegExp(String.raw`(?:^|[\s;&|(\`])${name}=${QUOTED}?(?!(?:0|false)?(?:\s|$))\S`)
const SETS_CI = ASSIGNS('CI')
const SETS_PWDEBUG = ASSIGNS('PWDEBUG')
const SETS_SESSION = ASSIGNS('PLAYWRIGHT_CLI_SESSION')

// --extension, --cdp and --endpoint drive a browser that already runs, the user's too.
const HEADED = /^--(?:headed(?:=(?!false$).*)?|extension(?:=.*)?|cdp(?:=.*)?|endpoint(?:=.*)?)$/
// playwright-cli reads the same settings from the environment.
const HEADED_ENV = new RegExp(String.raw`(?:^|\s)PLAYWRIGHT_MCP_(?:HEADLESS=${QUOTED}?(?:false|0)(?:\s|$)|CDP_ENDPOINT=|EXTENSION=)`)
// The subcommand is the first word that is not a flag or the value of one.
const VALUE_FLAGS = new Set(['-s', '--session', '--config', '--browser', '--device', '--profile', '--idle-timeout', '--host', '--port'])
const SUBCOMMANDS = new Set([
  'open attach close detach goto type click dblclick',
  'fill drag drop hover select upload check uncheck',
  'snapshot find eval dialog-accept dialog-dismiss resize delete-data go-back',
  'go-forward reload press keydown keyup mousemove mousedown mouseup',
  'mousewheel screenshot pdf tab-list tab-new tab-close tab-select state-load',
  'state-save cookie-list cookie-get cookie-set cookie-delete cookie-clear localstorage-list localstorage-get',
  'localstorage-set localstorage-delete localstorage-clear sessionstorage-list sessionstorage-get sessionstorage-set sessionstorage-delete sessionstorage-clear',
  'set-color-scheme set-reduced-motion set-forced-colors set-contrast set-media clear-color-scheme clear-reduced-motion clear-forced-colors',
  'clear-contrast clear-media requests request request-headers request-body response-headers response-body',
  'route route-list unroute network-state-set console run-code recording-start recording-stop',
  'tracing-start tracing-stop video-start video-stop video-chapter video-show-actions video-hide-actions show',
  'pause-at resume step-over generate-locator highlight webmcp-list webmcp-call install',
  'install-browser list close-all kill-all',
].flatMap(line => line.split(' ')))
const WINDOW_SUBCOMMANDS = new Set(['show'])
const ALL_SESSIONS_SUBCOMMANDS = new Set(['close-all', 'kill-all'])
// Subcommands that act on no browser session.
const SESSION_FREE_SUBCOMMANDS = new Set(['', 'list', 'install', 'install-browser', 'attach'])
const NAMES_SESSION = /^(?:-s|--session)(?:=|$)/
const HELP = /^(?:--help|-h|--version)$/

// --autoConnect, --browserUrl and --wsEndpoint drive a browser that already runs, the user's too.
// The CLI takes each flag in camel case and in kebab case.
const VISIBLE_DEVTOOLS =
  /\s(?:--(?:no-headless|headless(?:=(?!\u0002?true(?![\w-]))[^\s=]*|\s+\u0002?false)|(?:autoConnect|auto-connect)(?!=false)|browserUrl|browser-url|wsEndpoint|ws-endpoint)|-[uw])(?![\w-])/
// A Lighthouse --port or a --hostname other than this machine attaches to a Chrome that runs.
const LIGHTHOUSE_ATTACHES = /\s--(?:port(?:=|\s+)(?!0(?:\s|$))\d|hostname(?:=|\s+)(?!(?:localhost|127\.0\.0\.1)(?:\s|$))\S)/

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

    const quoted = QUOTED + text.slice(1, -1).replace(QUOTED_SEPARATORS, FILL)

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

  return !/\s--(?:version|help)(?![\w-])/.test(words) && !/\s--chrome-flags=\S*--headless(?!=false)(?![\w-])/.test(words)
}

function testRunnerRefusal(assigned: string, words: string) {
  const args = words.replace(IS_TEST_RUNNER, '').trim().split(/\s+/).filter(Boolean)
  const subcommand = args.find(arg => !arg.startsWith('-')) ?? ''
  const windowFlag = args.some((arg, i) => TEST_WINDOW_FLAG.test(arg) && !(arg === '--debug' && args[i + 1] === 'cli'))

  if (TEST_WINDOW_SUBCOMMANDS.has(subcommand) || windowFlag || SETS_PWDEBUG.test(assigned)) {
    return TEST_WINDOW
  }

  return subcommand === 'test' && !SETS_CI.test(assigned) ? TEST_WINDOW : undefined
}

function subcommandOf(args: string[]) {
  for (let i = 0; i < args.length; i++) {
    if (VALUE_FLAGS.has(args[i] ?? '')) {
      i++
    } else if (!args[i]?.startsWith('-')) {
      return SUBCOMMANDS.has(args[i] ?? '') ? (args[i] ?? '') : ''
    }
  }

  return ''
}

function playwrightRefusal(assigned: string, words: string) {
  const args = words.replace(IS_PLAYWRIGHT, '').trim().split(/\s+/).filter(Boolean)
  const subcommand = subcommandOf(args)

  if (ALL_SESSIONS_SUBCOMMANDS.has(subcommand)) {
    return CLOSES_OTHERS
  }

  if (WINDOW_SUBCOMMANDS.has(subcommand) || args.some(arg => HEADED.test(arg)) || HEADED_ENV.test(assigned)) {
    return OPENS_WINDOW
  }

  const namesSession = args.some(arg => NAMES_SESSION.test(arg)) || SETS_SESSION.test(assigned)

  return namesSession || SESSION_FREE_SUBCOMMANDS.has(subcommand) || args.some(arg => HELP.test(arg)) ? undefined : NO_SESSION
}

// A substitution in the arguments is a match of its own: read the arguments with each one as one
// word, and without the `)` or backtick that closes a subshell around the command.
function withoutSubstitutions(words: string) {
  let flat = words

  for (let before = ''; before !== flat; ) {
    before = flat
    flat = flat.replace(/\$\([^()]*\)|`[^`]*`/g, 'SUBSTITUTION')
  }

  return flat.replace(/[)`]+(?=\s|$)/g, '')
}

// The deny reason for one command, or undefined where it opens no window and touches no other
// session's browser.
function refusal(run: string) {
  const assigned = run.match(LEADING)?.[0] ?? ''
  const words = withoutSubstitutions(run.slice(assigned.length)).trim()

  if (IS_OPENER.test(words)) {
    return OPENS_WINDOW
  }

  if (IS_BROWSER.test(words)) {
    return /\s--(?:headless(?!=false)|version|help)(?![\w-])/.test(words) ? undefined : BROWSER_WINDOW
  }

  if (IS_MAC_OPEN.test(words)) {
    return /\s(?:https?:\/\/|file:)|\.html?(?:\s|$)/.test(words) ? OPENS_WINDOW : undefined
  }

  if (IS_DEVTOOLS.test(words)) {
    return VISIBLE_DEVTOOLS.test(words) ? DEVTOOLS_WINDOW : undefined
  }

  if (IS_LIGHTHOUSE.test(words)) {
    if (LIGHTHOUSE_ATTACHES.test(words)) {
      return LIGHTHOUSE_ATTACH
    }

    return opensLighthouseWindow(words) ? LIGHTHOUSE_HEADED : undefined
  }

  if (!IS_PLAYWRIGHT.test(words) && IS_TEST_RUNNER.test(words)) {
    return testRunnerRefusal(assigned, words)
  }

  return playwrightRefusal(assigned, words)
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
  // No .catch: where the guard fails, the engine skips it, so the command runs, and reports the failure.
  on('tool.call', { tool: ['Bash', 'Monitor'] }, ($, e, next) => {
    const reason = refusalOf(e.command ?? '')

    if (reason) {
      $.ui.toast('web-dev blocked a browser command')

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
