import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

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

const DENIED = [
  'revier open',
  'revier open dt-assist-cli',
  'revier open dt-assist-cli --attach',
  'revier go editor -p dt-assist-cli',
  'revier popup',
  'revier agent new -p dt-assist-cli',
  'revier agent focus dt-assist-cli:24',
  'revier shell new -p dt-assist-cli',
  'revier session restore',
  'revier session restore monday',
  'revier shutdown',
  'revier shutdown dt-assist-cli --agents',
  'revier shutdown --force --no-session-save',
  'cd /tmp && revier open demo',
  'revier status; revier popup',
  'revier popup;',
  'result=$(revier go web)',
  'echo start\nrevier agent new',
  'revier session restore --dry-run; revier session restore',
  'if revier session restore --dry-run; then revier session restore; fi',
  'for p in a b; do revier open "$p"; done',
  'timeout 30 revier open demo',
  'KITTY_LISTEN_ON=unix:/tmp/kitty revier popup',
  'nohup revier open demo &',
  'cut -f1 projects.txt | xargs -n1 revier open',
  'revier each -- revier open',
  'echo `revier go web`',
  'echo "$(revier go web)"',
  'echo "\\\\$(revier go web)"',
  'revier \\\n  open demo',
  'revier open demo # --dry-run',
  "python3 - <<'EOF'\nprint('x')\nEOF\nrevier open demo",
]

const ALLOWED = [
  'revier',
  'revier --help',
  'revier status',
  'revier list',
  'revier list --json dt-assist-cli',
  'revier agent --help',
  'revier agent wait dt-assist-cli --until stopped --timeout 300',
  "revier agent prompt dt-assist-cli -- 'run the tests'",
  "revier agent prompt dt-assist-cli -- 'revier open is for the user'",
  'revier session list',
  'revier session save --name monday',
  'revier session restore --dry-run',
  'revier session restore monday --dry-run',
  'revier shutdown --dry-run',
  'revier shutdown dt-assist-cli --targets --dry-run',
  'revier run build -p dt-assist-cli',
  'revier each log',
  './bin/revier open demo',
  'go run ./cmd/revier go editor -p demo',
  'grep -n "revier open" docs/RUNNING.md',
  'git commit -m "deny revier open and revier popup"',
  'echo revier; open .',
  'revier opening',
  'revier open --help',
  'revier agent new -h',
  'revier session restore monday \\\n  --dry-run',
  'plan=$(revier session restore --dry-run)',
  'git commit -m "Add the guard\n\nrevier open and revier go are denied now"',
  'git commit -m "$(cat <<\'EOF\'\nAdd the guard\n\nrevier popup is denied, and it\'s tested.\nEOF\n)"',
  'git commit -m "deny the focus movers (revier open, revier popup)"',
  'git commit -m "deny \\`revier open\\` in the guard"',
  'echo "\\$(revier open) stays text"',
  'echo "$(date) \\`revier open\\` stays text"',
  'grep -E "revier open|revier go" README.md',
  'cat > notes.md <<EOF\nrevier open demo\nEOF',
]

for (const command of DENIED) {
  test(`denies: ${command}`, async ($, on) => {
    const seen = host(on)

    const answer = await $.tool.call({ tool: 'Bash', command })

    expect(answer.deny).toContain('takes the focus')
    expect(seen.ran).toEqual([])
    expect(seen.toasts).toEqual(['blocked a command that takes the focus'])
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

const WATCH = { tool: 'Monitor', description: 'watch', timeout_ms: 60_000 } as const

test('denies a focus mover run through Monitor', async ($, on) => {
  const seen = host(on)

  const answer = await $.tool.call({ ...WATCH, command: 'revier open demo' })

  expect(answer.deny).toContain('takes the focus')
  expect(seen.ran).toEqual([])
  expect(seen.toasts).toEqual(['blocked a command that takes the focus'])
})

test('allows a Monitor command that moves no window', async ($, on) => {
  const seen = host(on)

  const answer = await $.tool.call({ ...WATCH, command: 'revier agent wait demo --until stopped' })

  expect(answer.deny).toBeUndefined()
  expect(seen.ran).toEqual(['Monitor'])
  expect(seen.toasts).toEqual([])
})

test('allows a Monitor that watches a socket and runs no command', async ($, on) => {
  const seen = host(on)

  const answer = await $.tool.call({ ...WATCH, ws: { url: 'wss://example.test/events' } })

  expect(answer.deny).toBeUndefined()
  expect(seen.ran).toEqual(['Monitor'])
  expect(seen.toasts).toEqual([])
})
