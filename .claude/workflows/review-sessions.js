export const meta = {
  name: 'review-sessions',
  description: 'Pick local sessions that used this marketplace\'s plugins, review each for plugin problems, and keep the run in the review store',
  whenToUse: 'To find what to improve in the plugins from real sessions. args: {perBucket, sinceDays}; one agent for the pick, at most two per picked session, one for the record.',
  phases: [
    { title: 'Pick', detail: 'scripts/pick-sessions.py pick' },
    { title: 'Review', detail: 'one reviewer per picked session' },
    { title: 'Verify', detail: 'one skeptic per session that has findings' },
    { title: 'Record', detail: 'scripts/pick-sessions.py record, then commit and push the run' },
  ],
}

const perBucket = args?.perBucket ?? 1
const sinceDays = args?.sinceDays ?? 7

const PICKS = {
  type: 'object',
  properties: {
    error: { type: 'string', description: 'what the command printed where it failed; absent where it printed the JSON' },
    run_dir: { type: 'string' },
    candidates: { type: 'number' },
    already_reviewed: { type: 'number' },
    sessions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          session_id: { type: 'string' },
          transcript: { type: 'string' },
          bucket: { type: 'string' },
          skill_versions: { type: 'object', additionalProperties: { type: 'array', items: { type: 'string' } } },
          subagents: { type: 'number' },
          pushback: { type: 'number' },
          errors: { type: 'number' },
          output_tokens: { type: 'number' },
        },
        required: ['session_id', 'transcript', 'bucket', 'skill_versions', 'subagents', 'pushback', 'errors', 'output_tokens'],
      },
    },
  },
  required: ['run_dir', 'candidates', 'already_reviewed', 'sessions'],
}

const FINDINGS = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          artifact: { type: 'string', description: 'repo path of the skill, hook or other plugin file at fault' },
          version: { type: 'string', description: 'the version label of the skill use that shows the problem, one of those the prompt lists; "unknown" where no skill use shows it, as with a hook' },
          problem: { type: 'string' },
          quote: { type: 'string', description: 'short verbatim excerpt of the transcript that shows the problem' },
          fix: { type: 'string', description: 'the change to the artifact that prevents it' },
        },
        required: ['artifact', 'version', 'problem', 'quote', 'fix'],
      },
    },
  },
  required: ['findings'],
}

const VERDICTS = {
  type: 'object',
  properties: {
    verdicts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          number: { type: 'number', description: 'the number of the finding in the prompt' },
          refuted: { type: 'boolean' },
          reason: { type: 'string' },
        },
        required: ['number', 'refuted', 'reason'],
      },
    },
  },
  required: ['verdicts'],
}

const READ_TRANSCRIPT = pick => `
Render the transcript to the file ${pick.session_id}.txt in your scratchpad directory and read that file in parts:
  python3 scripts/pick-sessions.py render ${pick.transcript}
Keep to that file name: other agents render other sessions into the same directory at the same time.
Its subagent transcripts are the agent-*.jsonl files below the directory of the same name without ".jsonl"; render one, to a file named after it, where the main transcript leaves a question open.
Read docs/MONITORING.md first. Change no file in the repository.`

phase('Pick')
const picks = await agent(
  `Run \`mise run pick-sessions -- pick --per-bucket ${perBucket} --since-days ${sinceDays}\` from the repository root and return the JSON it prints, unchanged. Where the command fails, return what it printed in \`error\`, with an empty run_dir and no sessions.`,
  { label: 'pick', phase: 'Pick', schema: PICKS, effort: 'low' },
)
if (!picks?.run_dir) throw new Error(`the pick failed: ${picks?.error ?? 'its agent returned nothing'}`)
log(`${picks.sessions.length} of ${picks.candidates} candidate sessions picked, ${picks.already_reviewed} reviewed by an earlier run: ${picks.run_dir}`)

const uses = pick => Object.entries(pick.skill_versions).map(([skill, versions]) => `${skill} at ${versions.join(' and ')}`).join('; ')

const reviewed = await pipeline(
  picks.sessions,
  pick => agent(
    `Review one Claude Code session for problems that a plugin under plugins/ in this repository caused.
Transcript: ${pick.transcript}
Picked for: ${pick.bucket}. Plugin skills used, each with the plugin version that served it: ${uses(pick)}. A label that starts with "dev@" is a checkout of this repository, not a release.
The pick counted ${pick.pushback} user pushbacks, ${pick.errors} failed tool results and ${pick.output_tokens} output tokens in the main transcript and its ${pick.subagents} subagent transcripts together: what the main transcript does not show is in a subagent transcript.
${READ_TRANSCRIPT(pick)}

A finding is a place where the agent or the user lost time or got a wrong result, and a change to a plugin file would have prevented it: an instruction that is wrong, unclear or missing, a skill the agent loaded and then did not follow, a skill that fired for the wrong request, a plugin guard that refused valid work. Open the plugin file and confirm that it says, or omits, what you claim.
Leave out faults of the environment, of the project the session ran in, and of Claude Code itself. A session with no plugin problem returns an empty list.`,
    { label: `review:${pick.bucket}`, phase: 'Review', schema: FINDINGS },
  ),
  async (review, pick) => {
    if (review.findings.length === 0) return []
    const check = await agent(
      `Another agent reviewed a Claude Code session and reports the numbered plugin problems below. Try to refute each one.
Transcript: ${pick.transcript}
${READ_TRANSCRIPT(pick)}

Refute a finding where the quote is not in the transcript, the plugin file does not say what the finding claims, the cause is outside the plugin, or the proposed fix would not have prevented the problem. Give one verdict for each number, with the reason; when in doubt, refute.

${review.findings.map((finding, i) => `Finding ${i + 1}:\n${JSON.stringify(finding, null, 1)}`).join('\n\n')}`,
      { label: `verify:${pick.bucket}`, phase: 'Verify', schema: VERDICTS },
    )
    // With no verifier the review did not finish: the session stays for a later run.
    if (!check) return null
    // A finding with no verdict was not checked, so it does not survive.
    return review.findings.map((finding, i) => {
      const verdict = check.verdicts.find(v => v.number === i + 1)
      return { ...finding, refuted: verdict?.refuted ?? true, reason: verdict?.reason ?? 'the verifier gave no verdict' }
    })
  },
)

const result = picks.sessions.map((pick, i) => ({ session_id: pick.session_id, findings: reviewed[i] ?? null }))

phase('Record')
const recorded = await agent(
  `Record a session review run. Do these steps in order and report the output of each command.
1. Write the JSON below, unchanged, to the file review-result.json in your scratchpad directory.
2. Run \`python3 scripts/pick-sessions.py record ${picks.run_dir} <that file>\` from the repository root.
3. The run folder is in a git repository of its own, the review store. With \`git -C\` on the run folder: add the run folder, commit it with the message "Add review run ${picks.run_dir.split('/').pop()}", and push. Where a step fails, stop and report the error; do not force anything.

${JSON.stringify(result, null, 1)}`,
  { label: 'record', phase: 'Record', effort: 'low' },
)

return { run_dir: picks.run_dir, recorded, sessions: result }
