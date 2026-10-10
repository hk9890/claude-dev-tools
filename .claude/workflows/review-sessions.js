export const meta = {
  name: 'review-sessions',
  description: 'Pick local sessions that used this marketplace\'s plugins and review each for plugin problems',
  whenToUse: 'To find what to improve in the plugins from real sessions. args: {perBucket, sinceDays}; one agent for the pick, at most two per picked session.',
  phases: [
    { title: 'Pick', detail: 'scripts/pick-sessions.py pick' },
    { title: 'Review', detail: 'one reviewer per picked session' },
    { title: 'Verify', detail: 'one skeptic per session that has findings' },
  ],
}

const perBucket = args?.perBucket ?? 1
const sinceDays = args?.sinceDays ?? 7

const PICKS = {
  type: 'object',
  properties: {
    candidates: { type: 'number' },
    sessions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          session: { type: 'string' },
          bucket: { type: 'string' },
          skills: { type: 'array', items: { type: 'string' } },
          versions: { type: 'array', items: { type: 'string' } },
          subagents: { type: 'number' },
          pushback: { type: 'number' },
          errors: { type: 'number' },
          output_tokens: { type: 'number' },
        },
        required: ['session', 'bucket', 'skills', 'versions', 'subagents', 'pushback', 'errors', 'output_tokens'],
      },
    },
  },
  required: ['candidates', 'sessions'],
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
          problem: { type: 'string' },
          quote: { type: 'string', description: 'short verbatim excerpt of the transcript that shows the problem' },
          fix: { type: 'string', description: 'the change to the artifact that prevents it' },
        },
        required: ['artifact', 'problem', 'quote', 'fix'],
      },
    },
  },
  required: ['findings'],
}

const sessionId = session => session.split('/').pop().replace(/\.jsonl$/, '')

const READ_TRANSCRIPT = session => `
Render the transcript to the file ${sessionId(session)}.txt in your scratchpad directory and read that file in parts:
  python3 scripts/pick-sessions.py render ${session}
Keep to that file name: other agents render other sessions into the same directory at the same time.
Its subagent transcripts are the agent-*.jsonl files below the directory of the same name without ".jsonl"; render one, to a file named after it, where the main transcript leaves a question open.
Read docs/MONITORING.md first. Change no file in the repository.`

phase('Pick')
const picks = await agent(
  `Run \`python3 scripts/pick-sessions.py pick --per-bucket ${perBucket} --since-days ${sinceDays}\` from the repository root and return the JSON it prints, unchanged.`,
  { label: 'pick', phase: 'Pick', schema: PICKS, effort: 'low' },
)
log(`${picks.sessions.length} of ${picks.candidates} candidate sessions picked`)

const reviewed = await pipeline(
  picks.sessions,
  pick => agent(
    `Review one Claude Code session for problems that a plugin under plugins/ in this repository caused.
Session: ${pick.session}
Picked for: ${pick.bucket}. Plugin skills used: ${pick.skills.join(', ')}. Plugin versions: ${pick.versions.join(', ') || 'dev checkout'}.
The pick counted ${pick.pushback} user pushbacks, ${pick.errors} failed tool results and ${pick.output_tokens} output tokens in the main transcript and its ${pick.subagents} subagent transcripts together: what the main transcript does not show is in a subagent transcript.
${READ_TRANSCRIPT(pick.session)}

A finding is a place where the agent or the user lost time or got a wrong result, and a change to a plugin file would have prevented it: an instruction that is wrong, unclear or missing, a skill the agent loaded and then did not follow, a skill that fired for the wrong request, a plugin guard that refused valid work. Open the plugin file and confirm that it says, or omits, what you claim.
Leave out faults of the environment, of the project the session ran in, and of Claude Code itself. A session with no plugin problem returns an empty list.`,
    { label: `review:${pick.bucket}`, phase: 'Review', schema: FINDINGS },
  ),
  (review, pick) => review.findings.length === 0 ? review : agent(
    `Another agent reviewed a Claude Code session and reports the plugin problems below. Try to refute each one.
Session: ${pick.session}
${READ_TRANSCRIPT(pick.session)}

Refute a finding where the quote is not in the transcript, the plugin file does not say what the finding claims, the cause is outside the plugin, or the proposed fix would not have prevented the problem. Return the findings that survive, unchanged; when in doubt, refute.

${JSON.stringify(review.findings, null, 1)}`,
    { label: `verify:${pick.bucket}`, phase: 'Verify', schema: FINDINGS },
  ),
)

return picks.sessions.map((pick, i) => ({ ...pick, findings: reviewed[i]?.findings ?? null }))
