export const meta = {
  name: 'tasks-work',
  description: 'Run a set of ready taskmgr tasks: implement → verify(review ∥ test) → record(close|comment); then verify (never auto-close) the parent epic',
  phases: [
    { title: 'Implement', detail: 'one implementer per task' },
    { title: 'Verify', detail: 'review ∥ test per implemented task' },
    { title: 'Record', detail: 'close on pass, comment otherwise' },
    { title: 'Close', detail: 'verify the epic, post a ready-to-close comment (no auto-close)' },
  ],
}

// args, supplied by the tasks-work skill (which ran taskmgr ready in the main loop):
//   { taskIds: string[], epicId?: string }
// The script owns sequencing and null-handling; every taskmgr read/write happens inside an agent.
const taskIds = (args && args.taskIds) || []
const epicId = (args && args.epicId) || null

if (!taskIds.length) {
  return { error: 'No taskIds provided. The tasks-work skill must resolve the scope and pass taskIds.' }
}

const IMPL_SCHEMA = {
  type: 'object',
  required: ['taskId', 'status'],
  properties: {
    taskId: { type: 'string' },
    status: { type: 'string', enum: ['implemented', 'blocked', 'unready'] },
    summary: { type: 'string' },
    bugsFiled: { type: 'array', items: { type: 'string' } },
  },
}
const REVIEW_SCHEMA = {
  type: 'object',
  required: ['verdict'],
  properties: {
    verdict: { type: 'string', enum: ['ok', 'concerns', 'reject'] },
    summary: { type: 'string' },
    findings: { type: 'array', items: { type: 'string' } },
  },
}
const TEST_SCHEMA = {
  type: 'object',
  required: ['pass'],
  properties: {
    pass: { type: 'boolean' },
    evidence: { type: 'string' },
    bugsFiled: { type: 'array', items: { type: 'string' } },
  },
}
const RECORD_SCHEMA = {
  type: 'object',
  required: ['taskId', 'action'],
  properties: {
    taskId: { type: 'string' },
    action: { type: 'string', enum: ['closed', 'left-open', 'inconclusive'] },
    reason: { type: 'string' },
  },
}
const EPIC_SCHEMA = {
  type: 'object',
  required: ['epicId', 'allChildrenClosed', 'action'],
  properties: {
    epicId: { type: 'string' },
    allChildrenClosed: { type: 'boolean' },
    action: { type: 'string', enum: ['verified-ready-to-close', 'blocked', 'criteria-failed'] },
    comment: { type: 'string' },
  },
}

const implementPrompt = (id) =>
  `Implement taskmgr task ${id} as one unit of an execution run. Follow your implementer instructions: run the readiness gate first; if the ticket is not executable, comment the gaps and report status "unready" (do NOT claim or write code). If ready, claim it (\`taskmgr update ${id} --status in_progress\`), implement the simplest change that satisfies the acceptance criteria, run the project's relevant tests, and file a bug directly for any unrelated defect you find. Do NOT close the task. Report status "implemented" (ready to verify) or "blocked" (with the reason in summary), a short summary of what changed, and any bug ids filed.`

const reviewPrompt = (id, impl) =>
  `Review the implementation just made for taskmgr task ${id}. Run \`taskmgr show ${id}\` for intent and inspect the working-tree change (\`git diff\`). You are READ-ONLY: do not edit code and do not write the tracker. Return a verdict: "ok" (no blocking concern), "concerns" (real but non-blocking issues), or "reject" (a blocking correctness or design flaw that should stop closure), with a one-line summary and any findings. Implementation summary: ${JSON.stringify(impl && impl.summary)}.`

const testPrompt = (id, impl) =>
  `Verify taskmgr task ${id} against its acceptance criteria by EXECUTING — run the project's tests/commands and trigger the behavior; do not infer from reading code. REPORT ONLY in this run: do NOT close the task (the workflow records the decision). File a bug directly for any failing criterion or unrelated breakage. Return pass=true only if every acceptance criterion was executed and passed; otherwise pass=false with evidence and any bug ids filed. Implementation summary: ${JSON.stringify(impl && impl.summary)}.`

const recordPrompt = (id, review, test) =>
  `Record the outcome for taskmgr task ${id}. You are RECORDING a decision, NOT verifying: do not run tests, re-read code, or file bugs — decide solely from the TEST and REVIEW JSON below. Apply exactly one tracker action, evaluating these rules IN ORDER (first match wins):\n` +
  `1. If EITHER leg is null/missing (an agent did not complete) → leave OPEN, \`taskmgr comment add ${id} "verification incomplete: <which stage did not complete>"\`, report action "inconclusive". Do NOT close.\n` +
  `2. Otherwise if TEST.pass is not true, OR REVIEW.verdict === "reject" → leave OPEN, \`taskmgr comment add ${id} "<why: failing criterion or blocking finding; any bug ids the test leg already filed>"\`, report action "left-open".\n` +
  `3. Otherwise (TEST.pass === true AND REVIEW.verdict !== "reject") → close it: \`taskmgr close ${id} --reason "verified: <how>; review: <verdict>"\`, report action "closed".\n` +
  `TEST result: ${JSON.stringify(test)}\nREVIEW result: ${JSON.stringify(review)}`

const epicClosePrompt = (id) =>
  `Epic-closure verification for taskmgr epic ${id}. taskmgr does NOT gate closure, so verify ordering yourself and NEVER close the epic — a human closes it.\n` +
  `1. Run \`taskmgr show ${id}\` to confirm ${id} resolves to a real epic. If it does not exist or is not an epic, report allChildrenClosed=false, action "blocked", and STOP — an empty child list from a wrong/typo'd id is NOT "all children closed".\n` +
  `2. Run \`taskmgr list -q 'parent == "${id}" && status != "closed"' --json\`. If it errors or returns a non-empty list, \`taskmgr comment add ${id}\` naming the still-open children, and STOP: report allChildrenClosed=false, action "blocked".\n` +
  `3. Only if the query succeeded AND returned empty: independently confirm the epic's own success criteria are met (not merely that children closed) and run project verification (build/tests/lint as the project defines).\n` +
  `4. Write the per-criterion verdict and evidence as a comment: \`taskmgr comment add ${id} "Acceptance review: <criterion> PASS — <evidence>; … Children all closed. Ready to close."\`\n` +
  `5. Do NOT close the epic. Report allChildrenClosed=true and action "verified-ready-to-close", or "criteria-failed" (comment the gaps and file bugs) if the success criteria are not met.`

async function runTask(id) {
  const impl = await agent(implementPrompt(id), { agentType: 'tasks:implementer', phase: 'Implement', label: `impl:${id}`, schema: IMPL_SCHEMA })
  if (!impl || impl.status !== 'implemented') {
    // blocked / unready / dead agent — nothing to verify; the implementer already commented (or it died).
    return { taskId: id, impl, record: { taskId: id, action: impl ? 'left-open' : 'inconclusive', reason: impl ? impl.status : 'implementer did not complete' } }
  }
  const [review, test] = await parallel([
    () => agent(reviewPrompt(id, impl), { agentType: 'project-quality:project-reviewer', phase: 'Verify', label: `review:${id}`, schema: REVIEW_SCHEMA }),
    () => agent(testPrompt(id, impl), { agentType: 'tasks:verifier', phase: 'Verify', label: `test:${id}`, schema: TEST_SCHEMA }),
  ])
  let record = await agent(recordPrompt(id, review, test), { agentType: 'tasks:verifier', phase: 'Record', label: `record:${id}`, schema: RECORD_SCHEMA })
  if (!record) record = { taskId: id, action: 'inconclusive', reason: 'record agent did not complete' }
  return { taskId: id, impl, review, test, record }
}

phase('Implement')
log(`Running ${taskIds.length} task(s)${epicId ? ` under epic ${epicId}` : ''}`)
const perTask = await parallel(taskIds.map((id) => () => runTask(id)))

let epic = null
if (epicId) {
  phase('Close')
  epic = await agent(epicClosePrompt(epicId), { agentType: 'tasks:verifier', phase: 'Close', label: `epic:${epicId}`, schema: EPIC_SCHEMA })
}

const closed = perTask.filter((r) => r && r.record && r.record.action === 'closed').map((r) => r.taskId)
const open = perTask.filter((r) => r && r.record && r.record.action === 'left-open').map((r) => r.taskId)
const inconclusive = perTask.filter((r) => r && r.record && r.record.action === 'inconclusive').map((r) => r.taskId)

return {
  summary: { total: taskIds.length, closed: closed.length, left_open: open.length, inconclusive: inconclusive.length, epic: epic ? epic.action : 'n/a' },
  closed,
  left_open: open,
  inconclusive,
  epic,
  perTask,
}
