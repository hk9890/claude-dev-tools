export const meta = {
  name: 'auto-work-triage',
  description: 'Act on a planned project-auto-work audit: fix settled survivors as PRs, write the taskmgr bodies for the rest',
  whenToUse: 'Launched by the test-tests and test-app skills after bin/triage-plan.py. Opens a PR for each planned fix and writes one taskmgr body per item to file; bin/triage-file.py files them.',
  phases: [
    { title: 'Fix', detail: 'one agent per planned fix: worktree, test, proving check, PR' },
    { title: 'Bodies', detail: 'one agent per item to file, plus each fix that failed' },
  ],
}

// args: { repoRoot, scratchDir, planDir, tool, fixes: [n], bodies: [n] } — printed by
// bin/triage-plan.py. Each n names <planDir>/item-<n>.json.

// ---------------------------------------------------------------------------
// Pure helpers — unit-tested via tests/project-auto-work/script-tests/test-triage.js.
// ---------------------------------------------------------------------------

// The runtime may hand `args` over as a JSON string rather than a parsed object.
function normalizeArgs(rawArgs) {
  let parsed = rawArgs
  if (typeof parsed === 'string') {
    try { parsed = JSON.parse(parsed) } catch { parsed = {} }
  }
  parsed = parsed || {}
  const repoRoot = String(parsed.repoRoot || '')
  const scratchDir = String(parsed.scratchDir || '')
  const planDir = String(parsed.planDir || '')
  const tool = String(parsed.tool || '')
  const numbers = v => (Array.isArray(v) ? v : []).map(Number).filter(n => Number.isInteger(n) && n > 0)
  const fixes = numbers(parsed.fixes)
  const bodies = numbers(parsed.bodies)

  // Each path is interpolated into git and shell commands: an unsubstituted "<…>"
  // placeholder or a relative path would put worktrees and bodies inside the audited repo.
  let error = null
  const relative = Object.entries({ repoRoot, scratchDir, planDir }).find(([, v]) => !v.startsWith('/'))
  if (relative) error = `${relative[0]} must be an absolute path (got ${JSON.stringify(relative[1])})`
  else if (!['test-tests', 'test-app'].includes(tool)) error = `tool must be test-tests or test-app (got ${JSON.stringify(tool)})`
  else if (tool === 'test-app' && fixes.length) error = 'test-app items are never fixed unattended, but fixes is not empty'

  return { repoRoot, scratchDir, planDir, tool, fixes, bodies, receivedKeys: Object.keys(parsed), error }
}

const FIX_SCHEMA = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['pr', 'failed'] },
    url: { type: 'string' },
    branch: { type: 'string' },
    reason: { type: 'string' },
  },
  required: ['status'],
}

const BODY_SCHEMA = {
  type: 'object',
  properties: { title: { type: 'string' } },
  required: ['title'],
}

function fixPrompt(cfg, n) {
  const item = `${cfg.planDir}/item-${n}.json`
  const wt = `${cfg.scratchDir}/fix-${n}`
  return (
    `You fix one weakness a test-suite audit proved, and open a pull request for it. Nobody watches this run.\n\n` +
    `Read ${item}. It holds the finding, its one settled proposal, the surviving mutant (mutant.diff, mutant.file, mutant.line), ` +
    `the dedup key and label, and context: repoRoot, test_cmd, worktree_setup, audited_head, pr_base.\n` +
    `The mutant SURVIVED: the suite stayed green with it applied. Your test must make the suite fail on it.\n\n` +
    `STEPS — stop at the first that fails, and go to CLEANUP:\n` +
    `1. Branch name: auto-work/<the dedup label without "dedup:">-<the first 7 characters of audited_head>. ` +
    `git -C ${cfg.repoRoot} worktree add -b <branch> ${wt} <audited_head>\n` +
    `2. cd ${wt}; replay worktree_setup verbatim where it is not empty, adjusting only the worktree path.\n` +
    `3. Write the test the proposal names. Rules: change test code only, never production code; ` +
    `never skip, disable, quarantine, delete or exclude a test; at most 1 file and 50 added lines ` +
    `(check with git diff --numstat <audited_head>); follow the conventions of the tests next to it.\n` +
    `4. Proving check, each run wrapped in timeout 590:\n` +
    `   a. apply mutant.diff (git apply), run test_cmd: it MUST fail, and fail in your new test.\n` +
    `   b. revert it (git apply -R), run test_cmd: it MUST pass.\n` +
    `   git status must then show only your test change.\n` +
    `5. Commit in the project's commit style (read its contributing or change-workflow doc if it has one). ` +
    `git push -u origin <branch>.\n` +
    `6. gh label create source:project-auto-work --force; then gh pr create --base <pr_base> --head <branch> --label source:project-auto-work, ` +
    `with a title and a body that states the finding, the mutant diff, and both proving-check results, and ends with the exact line\n` +
    `   dedup-key: <the item's key>\n` +
    `   Where the item has "related" ids, name them in the body as earlier closed tasks this one regresses.\n` +
    `   Never merge the PR, never push to <pr_base>, never request or run a review.\n\n` +
    `CLEANUP, always: git -C ${cfg.repoRoot} worktree remove --force ${wt}. ` +
    `After a failure also delete the branch locally (git -C ${cfg.repoRoot} branch -D <branch>) and on origin if you pushed it.\n\n` +
    `Return status "pr" with url and branch, or status "failed" with reason: the step that failed and what it printed.`
  )
}

function bodyPrompt(cfg, n, failedFix) {
  const item = `${cfg.planDir}/item-${n}.json`
  const body = `${cfg.planDir}/body-${n}.md`
  return (
    `You write one taskmgr issue body from a ${cfg.tool} audit item. A script files it; you run no taskmgr command.\n\n` +
    `Read ${item}: its finding or question (and more_findings, where findings share the item), its proposals (decision, action, rationale, and for open ones question, options, recommendation), ` +
    `its type, tier, reason, key and context. Read the code it names where that makes the body concrete.\n` +
    (failedFix ? `An unattended fix was attempted and failed: ${failedFix}. Say so in the body, so the next person does not repeat it.\n` : '') +
    `\nWrite the body to ${body}. Write for a reader with no access to the audit: name paths, symbols and commands, and paste the evidence verbatim.\n` +
    `- type "doc" (a design question): headings ## Context, ## Options (each option with its cost), ## Recommendation ` +
    `(the report's recommendation, or "No recommendation in the report.").\n` +
    `- any other type: exactly the headings ## Context, ## Problem, ## Recommended action, ## Acceptance criteria. ` +
    `Acceptance criteria are a "- [ ]" list, each item runnable by someone who was not there — for a surviving mutant: ` +
    `"with this diff applied, <test_cmd> fails". For an open proposal, the Recommended action is the decision to make and its options.\n` +
    `End ## Context with the exact line\n  dedup-key: <the item's key>\n` +
    `\nReturn the issue title: under 80 characters, naming the place and the weakness.`
  )
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { normalizeArgs, fixPrompt, bodyPrompt, FIX_SCHEMA, BODY_SCHEMA }
}

// ---------------------------------------------------------------------------
// Orchestration — runs only under the Workflow runtime, which injects `agent`.
// ---------------------------------------------------------------------------

if (typeof agent === 'function') {
  const cfg = normalizeArgs(args)
  if (cfg.error) {
    log(`auto-work-triage: ${cfg.error} (keys: ${cfg.receivedKeys.join(', ') || 'none'})`)
    return { error: cfg.error, got: { type: typeof args, keys: cfg.receivedKeys } }
  }

  const writeBody = (n, failedFix) =>
    agent(bodyPrompt(cfg, n, failedFix), { label: `body:${n}`, phase: 'Bodies', schema: BODY_SCHEMA })
      .then(r => (r ? { n, title: r.title } : null))

  // A fix that fails is filed instead, so its body is written as soon as the fix returns.
  const fixRuns = pipeline(cfg.fixes,
    n => agent(fixPrompt(cfg, n), { label: `fix:${n}`, phase: 'Fix', schema: FIX_SCHEMA }),
    async (fix, n) => {
      const outcome = { n, ...(fix || { status: 'failed', reason: 'the fix agent returned nothing' }) }
      const body = outcome.status === 'pr' ? null : await writeBody(n, outcome.reason)
      return { fix: outcome, body }
    })
  const [fixed, bodies] = await Promise.all([fixRuns, parallel(cfg.bodies.map(n => () => writeBody(n)))])

  const done = fixed.filter(Boolean)
  return {
    fixes: done.map(r => r.fix),
    bodies: [...bodies, ...done.map(r => r.body)].filter(Boolean),
  }
} else {
  throw new Error('auto-work-triage: the Workflow runtime did not inject the `agent` hook')
}
