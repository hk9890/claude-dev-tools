import { expect, test } from 'claude-code/testing'
import type { On, ToolCheckResult } from 'claude-code'

// Stands for the host: records the toasts shown and the tool calls that reached the engine.
function host(on: On) {
  const seen = { toasts: [] as string[], ran: [] as string[] }

  on('ui.toast', ($, e) => {
    seen.toasts.push(e.text)

    return { value: undefined }
  })
  on('tool.call', ($, e) => {
    seen.ran.push(String(e.tool))

    return { result: 'ok' }
  })

  return seen
}

const OPENS_WINDOW = [
  'playwright-cli open --headed https://example.com',
  'playwright-cli -s=claude-s1 open --headed=true https://example.com',
  'playwright-cli -s=claude-s1 open https://example.com --browser=chrome --headed',
  'playwright-cli show',
  'playwright-cli -s=claude-s1 show --annotate',
  'cd /tmp/x && playwright-cli -s=claude-s1 show',
  'npx playwright cli open --headed https://example.com',
  'npx -y @playwright/cli show',
  'xdg-open http://localhost:5173',
  'gio open http://localhost:5173',
  'sensible-browser http://localhost:5173',
  'npm run dev & xdg-open http://localhost:5173',
  'timeout 5 xdg-open index.html',
  'result=$(xdg-open x)',
  'echo "$(xdg-open x)"',
  'chrome-devtools start --headless=false',
  'chrome-devtools start --headless false --isolated',
  'chrome-devtools start --no-headless',
  'chrome-devtools start --autoConnect',
  'playwright-cli -s=a close; playwright-cli -s=a open --headed',
  'playwright-cli -s=claude-s1 open --extension',
  'playwright-cli -s=claude-s1 open --cdp=http://127.0.0.1:9222',
  'lighthouse http://localhost:4173 --output=json',
  'npm run build && lighthouse http://localhost:4173',
  'chrome-devtools start --headless --isolated && lighthouse http://localhost:4173',
  'lighthouse http://localhost:4173 --output=json; echo --help',
  'lighthouse http://localhost:4173 --chrome-flags="--headless=false"',
  'chrome-devtools start --browserUrl http://127.0.0.1:9222',
  'chrome-devtools start --wsEndpoint=ws://127.0.0.1:9222/devtools/browser/x',
  'chrome-devtools start -u http://127.0.0.1:9222',
  'playwright-cli -s claude-s1 show',
  'playwright-cli --session claude-s1 open --headed',
  'chrome-devtools start --browser-url http://127.0.0.1:9222',
  'chrome-devtools start --ws-endpoint=ws://127.0.0.1:9222/devtools/browser/x',
  'chrome-devtools start --auto-connect',
  'lighthouse http://localhost:4173 --output=json # --headless',
  'lighthouse http://localhost:4173 # --help',
  'lighthouse http://x/--headless',
  'lighthouse http://localhost:4173 --chrome-flags="--headless=new" --view',
  'npx lighthouse http://localhost:4173',
  'npx -y lighthouse@13 http://localhost:4173',
  'npx playwright-cli show',
  'pnpm dlx @playwright/cli show',
  'bunx @playwright/cli show',
  'npx @playwright/cli@latest show',
  '/home/u/.local/bin/playwright-cli show',
  'for i in 1 2 3; do echo "Run #$i"; lighthouse http://localhost:4173 --output=json; done',
  "git commit -m 'fix #12' && lighthouse http://localhost:4173",
  'lighthouse http://localhost:4173 --output=json --headless --quiet',
  'playwright-cli -s=a attach --endpoint=ws://127.0.0.1:3000/x',
  '/usr/bin/xdg-open http://localhost:5173',
  './node_modules/.bin/chrome-devtools start --no-headless',
  '$HOME/.local/bin/playwright-cli -s=a show',
  'mise exec -- playwright-cli -s=a show',
  'pnpm exec playwright-cli -s=a show',
  'npm exec lighthouse http://localhost:4173',
  'yarn dlx @playwright/cli -s=a show',
  'npx -p lighthouse lighthouse http://localhost:4173',
  'chrome-devtools start --headless "false" --isolated',
  "chrome-devtools start --headless='false'",
  'x-www-browser http://localhost:5173',
  'python3 -m webbrowser http://localhost:5173',
  '(cd /tmp/s && playwright-cli -s=a open --headed)',
  '(cd /tmp/s && playwright-cli -s=a show)',
  'chrome-devtools start --headless=new --isolated',
  'npx --no playwright-cli show',
  'playwright-cli -s=a --host 127.0.0.1 show',
  'wslview http://localhost:5173',
  'google-chrome http://localhost:5173',
  'firefox http://localhost:5173',
  'open http://localhost:5173',
  'open dist/index.html',
  'chrome-devtools start --isolated --userDataDir=$(mktemp -d) --no-headless',
  'playwright-cli -s=a open "$(cat url.txt)" --headed',
  'lighthouse http://localhost:4173 --chrome-flags "--headless=new" --output=json',
  'lighthouse http://x --chrome-flags="--headless=new" --output-path=/x/lh-$(date +%s).json --view',
  'playwright-cli -s open show',
  'PLAYWRIGHT_MCP_HEADLESS=false playwright-cli -s=a open',
  'PLAYWRIGHT_MCP_CDP_ENDPOINT=http://127.0.0.1:9222 playwright-cli -s=a open',
]

const TEST_WINDOWS = [
  'npx playwright test',
  'npx playwright test --ui',
  '(cd web && npx playwright show-report)',
  '(cd web && npx playwright codegen)',
  '(CI=1 npx playwright test --ui)',
  'pnpm playwright test --ui',
  'pnpm playwright show-report',
  'npm x playwright test --ui',
  'bun x playwright test --ui',
  'npx --no-install playwright test --ui',
  'npx @playwright/test show-report',
  'CI=1 npx playwright test --ui-port=0',
  'CI=1 npx playwright test --ui-host=127.0.0.1',
  'PWDEBUG=1 CI=1 npx playwright test',
  'CI=1 npx playwright test --debug',
  'CI=1 npx playwright test --output=$(mktemp -d) --headed',
  'npx playwright test CI=1',
  'CI=1 npx playwright test --headed',
  'CI=1 npx playwright test --debug e2e/login.spec.ts',
  'CI=0 npx playwright test',
  'npx playwright show-report',
  'npx playwright codegen http://localhost:5173',
  'pnpm exec playwright show-trace trace.zip',
  'playwright open http://localhost:5173',
  './node_modules/.bin/playwright test',
]

const NO_SESSION = ['playwright-cli close', 'playwright-cli goto http://localhost:5173', 'cd /tmp && playwright-cli delete-data']

const CLOSES_OTHERS = ['x=$(playwright-cli -s=a kill-all)', 'playwright-cli --session close close-all', 'playwright-cli close-all', 'playwright-cli -s=claude-s1 kill-all', 'cd /tmp && playwright-cli close-all']

const ALLOWED = [
  'playwright-cli -s=claude-s1 open --browser=chrome http://localhost:5173',
  'playwright-cli -s=claude-s1 open --headed=false http://localhost:5173',
  'playwright-cli -s=claude-s1 close',
  'playwright-cli -s=claude-s1 fill e3 "show"',
  'playwright-cli -s=claude-s1 video-start demo.webm --size=1280x720',
  'playwright-cli --help',
  'playwright-cli list',
  'chrome-devtools start --headless --isolated --performanceCrux=false',
  'chrome-devtools start --autoConnect=false',
  'chrome-devtools navigate_page 1 --url http://localhost:4173',
  'lighthouse http://localhost:4173 --only-categories=performance --chrome-flags="--headless=new" --output=json',
  "lighthouse http://localhost:4173 --chrome-flags='--headless'",
  'lighthouse --version',
  'chrome-devtools stop && lighthouse http://localhost:4173 --chrome-flags="--headless=new"',
  'playwright-cli -s claude-s1 fill e3 show',
  "cat <<EOF\nlighthouse x\nEOF\nlighthouse http://localhost:4173 --chrome-flags='--headless=new'",
  'npx lighthouse http://localhost:4173 --chrome-flags=--headless',
  'chrome-devtools start --auto-connect=false',
  'lighthouse http://localhost:4173 --only-categories=performance \\\n  --chrome-flags="--headless=new" --output=json',
  'lighthouse "http://localhost:4173/?a=1&b=2" --chrome-flags="--headless=new"',
  'lighthouse http://localhost:4173 --chrome-flags="--headless=new" --view=false',
  'lighthouse http://localhost:4173 --chrome-flags="--no-sandbox --headless=new"',
  'PLAYWRIGHT_CLI_SESSION=claude-s1 playwright-cli close',
  'playwright-cli -s=claude-s1 fill e3 "show me"',
  'playwright-cli install-browser ffmpeg',
  'CI=1 npx playwright test',
  'CI=true npx playwright test e2e/x.spec.ts --reporter=line',
  'cd web && CI=1 npx playwright test --headed=false',
  'npx playwright install chromium',
  'npx playwright --version',
  'npx playwright cli -s=claude-s1 snapshot',
  'CI=1 npx playwright test --debug=cli',
  'cd web &&CI=1 npx playwright test',
  '(PLAYWRIGHT_CLI_SESSION=a playwright-cli close)',
  '(cd /tmp/s && playwright-cli -s=a snapshot)',
  'chrome-devtools start --headless=true',
  'google-chrome --headless=new --dump-dom http://localhost:5173',
  'lighthouse http://localhost:4173 --port=0 --chrome-flags="--headless=new"',
  'open -a Calculator',
  'lighthouse http://x --output-path=$(pwd)/out.json --chrome-flags="--headless=new"',
  'lighthouse "$(cat url)" --chrome-flags="--headless=new"',
  './scripts/lighthouse.sh',
  './lighthouse/run.sh --ci',
  './chrome/build.sh',
  'command -v lighthouse',
  'command -v xdg-open',
  'playwright-cli -s=a fill e3 "--headed"',
  'playwright-cli -s=a type "--headed"',
  "chrome-devtools start --headless='true'",
  'git commit -m "playwright-cli close; xdg-open x"',
  'playwright-cli -s=claude-s1 attach claude-s1-2',
  'git commit -m "deny playwright-cli --headed and xdg-open"',
  "grep -n 'xdg-open' README.md",
  'echo playwright-cli show',
  'cat <<EOF\nplaywright-cli show\nEOF',
  'ls # xdg-open',
  './bin/xdg-open-wrapper',
]

for (const command of OPENS_WINDOW) {
  test(`denies a window: ${command}`, async ($, on) => {
    const seen = host(on)

    const answer = await $.tool.call({ tool: 'Bash', command })

    expect(answer.deny).toContain("on the user's screen")
    expect(seen.ran).toEqual([])
    expect(seen.toasts.length).toBe(1)
  })
}

for (const command of TEST_WINDOWS) {
  test(`denies a Playwright Test window: ${command}`, async ($, on) => {
    const seen = host(on)

    const answer = await $.tool.call({ tool: 'Bash', command })

    expect(answer.deny).toContain('Playwright Test command')
    expect(seen.ran).toEqual([])
  })
}

for (const command of NO_SESSION) {
  test(`denies a command on the shared default session: ${command}`, async ($, on) => {
    const seen = host(on)

    const answer = await $.tool.call({ tool: 'Bash', command })

    expect(answer.deny).toContain('names no session')
    expect(seen.ran).toEqual([])
  })
}

for (const command of CLOSES_OTHERS) {
  test(`denies stopping other sessions: ${command}`, async ($, on) => {
    const seen = host(on)

    const answer = await $.tool.call({ tool: 'Bash', command })

    expect(answer.deny).toContain('every session on this machine')
    expect(seen.ran).toEqual([])
  })
}

for (const command of ALLOWED) {
  test(`allows: ${command}`, async ($, on) => {
    const seen = host(on)

    const answer = await $.tool.call({ tool: 'Bash', command })

    expect(answer.deny).toBeUndefined()
    expect(seen.ran).toEqual(['Bash'])
    expect(seen.toasts).toEqual([])
  })
}

test('denies a Lighthouse run that attaches to a running Chrome', async ($, on) => {
  const seen = host(on)

  const answer = await $.tool.call({ tool: 'Bash', command: 'lighthouse http://x --port=9222 --chrome-flags="--headless=new"' })

  expect(answer.deny).toContain('already runs')
  expect(seen.ran).toEqual([])
})

test('denies a window opened through Monitor', async ($, on) => {
  const seen = host(on)

  const answer = await $.tool.call({ tool: 'Monitor', description: 'watch', timeout_ms: 60_000, command: 'xdg-open http://localhost:5173' })

  expect(answer.deny).toContain("on the user's screen")
  expect(seen.ran).toEqual([])
})

const ASK: ToolCheckResult = { decision: 'ask' }

test('the web-dev:web-drive skill loads without a question', async ($, on) => {
  on('tool.check', () => ASK)

  const verdict = await $.tool.check({ tool: 'Skill', input: { skill: 'web-dev:web-drive' } })

  expect(verdict.decision).toBe('allow')
})

test('another skill keeps its question', async ($, on) => {
  on('tool.check', () => ASK)

  const verdict = await $.tool.check({ tool: 'Skill', input: { skill: 'web-drive' } })

  expect(verdict.decision).toBe('ask')
})

test('an ask rule of the user on the skill stands', async ($, on) => {
  on('tool.check', () => ({ decision: 'ask', rule: 'Skill(web-dev:web-drive)' }))

  const verdict = await $.tool.check({ tool: 'Skill', input: { skill: 'web-dev:web-drive' } })

  expect(verdict.decision).toBe('ask')
})
