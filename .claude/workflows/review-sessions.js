export const meta = {
  name: 'review-sessions',
  description: 'Pick the sessions of this machine, or of an ssh host, that used this marketplace\'s plugins, review each for plugin problems and judge the context its files cost, and keep the run in the review store',
  whenToUse: 'To find what to improve in the plugins from real sessions. args: {perBucket, sinceDays, host}; host is an ssh host whose sessions to review, this machine where absent; one agent for the pick, at most two per picked session, one for the record.',
  phases: [
    { title: 'Pick', detail: 'scripts/pick-sessions.py pick' },
    { title: 'Review', detail: 'one reviewer per picked session' },
    { title: 'Verify', detail: 'one skeptic per session that has findings or context judgments' },
    { title: 'Record', detail: 'scripts/pick-sessions.py record, then commit and push the run' },
  ],
}

const perBucket = args?.perBucket ?? 1
const sinceDays = args?.sinceDays ?? 7
const host = args?.host
// The host goes into a shell command: the pick takes the same names only.
if (host !== undefined && !/^[A-Za-z0-9_][A-Za-z0-9._@-]*$/.test(host)) throw new Error(`not an ssh host name: ${JSON.stringify(host)}`)

const RANKED_BUCKETS = ['pushback', 'errors', 'output_tokens']
const BUCKETS = [...RANKED_BUCKETS, 'changed', 'random']

const PICKS = {
  type: 'object',
  properties: {
    error: { type: 'string', description: 'what the command printed where it failed; absent where it printed the JSON' },
    run_dir: { type: 'string' },
    candidates: { type: 'number' },
    already_reviewed: { type: 'number' },
    large_transcripts: {
      type: 'array',
      items: {
        type: 'object',
        properties: { session_id: { type: 'string' }, largest_file_mb: { type: 'number' }, refused: { type: 'boolean' } },
        required: ['session_id', 'largest_file_mb', 'refused'],
      },
    },
    release: {
      type: ['object', 'null'],
      properties: {
        version: { type: 'string' },
        previous: { type: 'string' },
        plugins: { type: 'array', items: { type: 'string' } },
        candidates: { type: 'number' },
      },
      required: ['version', 'previous', 'plugins', 'candidates'],
    },
    sessions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          session_id: { type: 'string' },
          transcript: { type: 'string' },
          bucket: { type: 'string' },
          changed_files: { type: 'array', items: { type: 'string' }, description: 'absent where the session ran no plugin the release changed, at the release version' },
          skill_versions: { type: 'object', additionalProperties: { type: 'array', items: { type: 'string' } } },
          subagents: { type: 'number' },
          pushback: { type: 'number' },
          errors: { type: 'number' },
          output_tokens: { type: 'number' },
          context_files: { type: 'array', items: { type: 'string' }, description: 'files of this repository the session loaded, the skill listing left out' },
        },
        required: ['session_id', 'transcript', 'bucket', 'skill_versions', 'subagents', 'pushback', 'errors', 'output_tokens', 'context_files'],
      },
    },
    legend: {
      type: 'object',
      description: 'the legend the pick printed, every key of it unchanged',
      properties: {
        buckets: {
          type: 'object',
          properties: Object.fromEntries(BUCKETS.map(bucket => [bucket, { type: 'string' }])),
          required: BUCKETS,
        },
        signals: { type: 'string' },
        skill_versions: { type: 'object', additionalProperties: { type: 'string' } },
        label_source: { type: 'string' },
      },
      required: ['buckets', 'signals', 'skill_versions', 'label_source'],
    },
  },
  required: ['run_dir', 'candidates', 'already_reviewed', 'large_transcripts', 'release', 'sessions', 'legend'],
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
    context: {
      type: 'array',
      description: 'one judgment for each file the prompt lists as loaded',
      items: {
        type: 'object',
        properties: {
          artifact: { type: 'string', description: 'repo path of the loaded file, one of those the prompt lists' },
          needed: { type: 'string', enum: ['yes', 'partly', 'no'], description: 'whether the session needed the file for what it did' },
          used: { type: 'string', description: 'the sections the agent acted on, with the action; empty where none' },
          unused: { type: 'string', description: 'the sections the session carried and did not need' },
          missing: { type: 'string', description: 'what the agent had to find out, or got wrong, that the file could have said; empty where nothing' },
          quote: { type: 'string', description: 'short verbatim excerpt of the transcript that shows the judgment' },
        },
        required: ['artifact', 'needed', 'used', 'unused', 'missing', 'quote'],
      },
    },
  },
  required: ['findings', 'context'],
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
    context_verdicts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          number: { type: 'number', description: 'the number of the context judgment in the prompt' },
          refuted: { type: 'boolean' },
          reason: { type: 'string' },
        },
        required: ['number', 'refuted', 'reason'],
      },
    },
  },
  required: ['verdicts', 'context_verdicts'],
}

const READ_TRANSCRIPT = pick => `
Render the transcript to the file ${pick.session_id}.txt in your scratchpad directory and read that file in parts:
  python3 scripts/pick-sessions.py render ${pick.transcript}
Keep to that file name: other agents render other sessions into the same directory at the same time.
An ASSISTANT [<skill>] tag runs from the skill load to the next load or the end of the user turn, so work after the skill carries its tag too; a forked skill changes no tag. USER (queued) is a prompt the user typed while the agent worked.
Its subagent transcripts are the agent-*.jsonl files below the directory of the same name without ".jsonl"; render one, to a file named after it, where the main transcript leaves a question open.
Change no file in the repository.`

phase('Pick')
const picks = await agent(
  `Run \`mise run pick-sessions -- pick --per-bucket ${perBucket} --since-days ${sinceDays}${host ? ` --host ${host}` : ''}\` from the repository root and return the JSON it prints, unchanged.${host ? ' The pick first mirrors the host\'s transcripts over ssh, which can take minutes: give the command the longest Bash timeout, 600000 ms.' : ''} Where the command fails, return what it printed in \`error\`, with an empty run_dir and no sessions.`,
  { label: 'pick', phase: 'Pick', schema: PICKS, effort: 'low' },
)
if (!picks?.run_dir) throw new Error(`the pick failed: ${picks?.error ?? 'its agent returned nothing'}`)
log(`${picks.sessions.length} of ${picks.candidates} candidate sessions picked, ${picks.already_reviewed} reviewed by an earlier run: ${picks.run_dir}`)
log(`context cost of the window: ${picks.run_dir}/context.md`)

for (const large of picks.large_transcripts) {
  log(`session ${large.session_id} holds a ${large.largest_file_mb} MB file${large.refused ? ': not picked, GitHub refuses a file above 100 MB' : ''}`)
}

const release = picks.release
log(release
  ? `release ${release.version} changed ${release.plugins.join(', ') || 'no plugin'}: ${release.candidates} candidate sessions ran one of them at that version`
  : 'no last release: the checkout has fewer than two release tags, so the changed bucket is empty')

// The pick agent relays the JSON, and can return an empty list where the pick printed none.
const changes = pick => pick.changed_files?.length
  ? `\nRelease ${release.version} changed these files of the plugins the session ran at that version: ${pick.changed_files.join(', ')}. Read \`git diff v${release.previous} v${release.version} -- <files>\` first, and look for a problem that this change caused.`
  : ''

// The scripts count what a file cost and which reads followed it; whether the session needed it is a judgment.
const judgeContext = pick => pick.context_files.length
  ? `
Then judge each file of this repository that the session or one of its subagents loaded: ${pick.context_files.join(', ')}. Open each one. A file the main transcript does not show was loaded in a subagent transcript: render that transcript to judge it. For each, say whether the session needed it for what it did, which sections the agent acted on and how, which sections it carried and did not need, and what the agent had to find out, or got wrong, that the file could have said. A rule the agent obeyed leaves no trace of its own: count it as used where the session came to the action it governs. Give one context judgment per file.`
  : '\nThe session loaded no file of this repository: return an empty context list.'

// The pick's legend owns what a bucket, a count and a version label mean.
const labels = `${Object.entries(picks.legend.skill_versions).map(([label, meaning]) => `${label} is ${meaning}`).join('; ')}; ${picks.legend.label_source}`

const pickedFor = bucket => RANKED_BUCKETS.includes(bucket)
  ? `${bucket}, one of the candidates with the highest count of it below`
  : `${bucket}, ${picks.legend.buckets[bucket]}`
const counts = pick => RANKED_BUCKETS.map(bucket => `${bucket} ${pick[bucket]} (${picks.legend.buckets[bucket]})`).join(', ')

const uses = pick => Object.entries(pick.skill_versions).map(([skill, versions]) => `${skill} at ${versions.join(' and ')}`).join('; ')

const reviewed = await pipeline(
  picks.sessions,
  pick => agent(
    `Review one Claude Code session for problems that a plugin under plugins/ in this repository caused.
Transcript: ${pick.transcript}
Picked for: ${pickedFor(pick.bucket)}. Plugin skills used, each with the version labels that served it: ${uses(pick)}. Version labels: ${labels}.${changes(pick)}
The pick counted ${counts(pick)}; ${picks.legend.signals}. The session has ${pick.subagents} subagent transcripts: what the main transcript does not show is in one of them.
${READ_TRANSCRIPT(pick)}

A finding is a place where the agent or the user lost time or got a wrong result, and a change to a plugin file would have prevented it: an instruction that is wrong, unclear or missing, a skill the agent loaded and then did not follow, a skill that fired for the wrong request, a plugin guard that refused valid work. Open the plugin file and confirm that it says, or omits, what you claim.
Leave out faults of the environment, of the project the session ran in, and of Claude Code itself. A session with no plugin problem returns an empty list.
${judgeContext(pick)}`,
    { label: `review:${pick.bucket}`, phase: 'Review', schema: FINDINGS },
  ),
  async (review, pick) => {
    if (review.findings.length === 0 && review.context.length === 0) return { findings: [], context: [] }
    const check = await agent(
      `Another agent reviewed a Claude Code session and reports the numbered plugin problems and context judgments below. Try to refute each one.
Transcript: ${pick.transcript}
Version labels: ${labels}.
${READ_TRANSCRIPT(pick)}

Refute a finding where the quote is not in the transcript, the plugin file does not say what the finding claims, the cause is outside the plugin, or the proposed fix would not have prevented the problem. Give one verdict for each number, with the reason; when in doubt, refute.

${review.findings.map((finding, i) => `Finding ${i + 1}:\n${JSON.stringify(finding, null, 1)}`).join('\n\n') || 'No findings: return an empty verdicts list.'}

The reviewer also judged how useful each loaded file was. Refute a context judgment where the quote is not in the transcript, the file does not hold the sections it names, or the actions of the session contradict it: a file judged not needed whose text the agent followed, or one judged needed that the agent never acted on. Give one context verdict for each number, with the reason; when in doubt, refute.

${review.context.map((judgment, i) => `Context judgment ${i + 1}:\n${JSON.stringify(judgment, null, 1)}`).join('\n\n') || 'No context judgments: return an empty context_verdicts list.'}`,
      { label: `verify:${pick.bucket}`, phase: 'Verify', schema: VERDICTS },
    )
    // With no verifier the review did not finish: the session stays for a later run.
    if (!check) return null
    // An item with no verdict was not checked, so it does not survive.
    const judged = (items, verdicts) => items.map((item, i) => {
      const verdict = verdicts.find(v => v.number === i + 1)
      return { ...item, refuted: verdict?.refuted ?? true, reason: verdict?.reason ?? 'the verifier gave no verdict' }
    })
    return { findings: judged(review.findings, check.verdicts), context: judged(review.context, check.context_verdicts) }
  },
)

const result = picks.sessions.map((pick, i) => ({
  session_id: pick.session_id,
  findings: reviewed[i]?.findings ?? null,
  context: reviewed[i]?.context ?? [],
}))

phase('Record')
const recorded = await agent(
  `Record a session review run. Do these steps in order and report the output of each command.
1. Write the JSON below, unchanged, to the file review-result.json in your scratchpad directory.
2. Run \`python3 scripts/pick-sessions.py record ${picks.run_dir} <that file>\` from the repository root.
3. The run folder is in a git repository of its own, the review store. With \`git -C\` on the run folder: add the run folder, commit it with the message "Add review run ${picks.run_dir.split('/').pop()}", and push. Where a step fails, stop and report the error; do not force anything.

${JSON.stringify(result, null, 1)}`,
  { label: 'record', phase: 'Record', effort: 'low' },
)

return { run_dir: picks.run_dir, large_transcripts: picks.large_transcripts, recorded, sessions: result }
