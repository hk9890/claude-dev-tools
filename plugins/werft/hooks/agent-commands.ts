// The commands of the werft guide that an agent runs on this host: the agent commands of werft,
// and ssh, an scp copy into a lease and a tar pipe into a lease, each through the ssh_config of
// that lease. The skill's allowed-tools hold only for the turn that loaded the skill, and a lease
// answers in a later turn, so the mod allows these commands for the whole session.

type Token = { word: string } | { quoted: string } | { pipe: true }

// What a command needs before it may run: nothing more, or the lease it names must be live with
// this ssh_config, as `werft --json leases` reports it.
export type AgentCommand = { lease?: { id: string; config: string } }

// A word holds no character the shell gives a meaning to; a quoted string runs in the VM alone.
const WORD = /^[A-Za-z0-9_./:=@%+,-]+$/
const SAFE_SSH_OPTION = /^(?:ExitOnForwardFailure=yes|ConnectTimeout=\d+)$/
const FORWARD = /^\d+:[A-Za-z0-9.-]+:\d+$/
// A path in the working tree: relative, no `..` segment, and no leading `-`, which tar and scp
// would read as an option (`-I<program>`).
const LOCAL_PATH = /^(?![/-])(?!(?:.*\/)?\.\.(?:\/|$))[A-Za-z0-9_./@%+,-]+$/
// The werft commands the guide gives an agent. Pruning, confirming and the viewer belong to the
// user, in every spelling Go's flag package reads: `-prune`, `--prune`, `--prune=true`.
const AGENT_SUBCOMMANDS = ['images', 'lease', 'leases', 'extend', 'release', 'reap', 'guide', 'help']
const USER_FLAG = /^--?(?:prune|yes|view)(?:=|$)/

function tokens(command: string): Token[] | undefined {
  const end = command.trimEnd().length
  const found: Token[] = []
  // Only spaces and tabs part tokens: a newline starts a second command.
  const pattern = /([ \t]*)(?:'([^']*)'|(\|)|([^\s'|]+))/y
  let match: RegExpExecArray | null

  while (pattern.lastIndex < end && (match = pattern.exec(command))) {
    const [, space, quoted, pipe, word] = match

    // The shell joins what touches into one word: `id'x'` is not `id 'x'`.
    if (found.length > 0 && !space) {
      return undefined
    }

    if (quoted !== undefined) {
      found.push({ quoted })
    } else if (pipe) {
      found.push({ pipe: true })
    } else if (word && WORD.test(word)) {
      found.push({ word })
    } else {
      return undefined
    }
  }

  return pattern.lastIndex >= end ? found : undefined
}

const wordOf = (token: Token | undefined) => (token && 'word' in token ? token.word : undefined)
const textOf = (token: Token) => ('word' in token ? token.word : 'quoted' in token ? token.quoted : '|')
const isWords = (list: Token[]) => list.every(token => 'word' in token)

// werft [--json] <agent subcommand> [words]
function werft(list: Token[]): AgentCommand | undefined {
  const words = list.map(wordOf)
  const subcommand = words[1] === '--json' ? words[2] : words[1]

  return words[0] === 'werft' &&
    isWords(list) &&
    AGENT_SUBCOMMANDS.includes(subcommand ?? '') &&
    !words.some(word => USER_FLAG.test(word ?? ''))
    ? {}
    : undefined
}

// ssh -F <config> [-f] [-N] [-o <safe option>] [-L <forward>] <lease id> [remote command]
function ssh(list: Token[]): AgentCommand | undefined {
  const [command, flag, config] = list.map(wordOf)

  if (command !== 'ssh' || flag !== '-F' || !config) {
    return undefined
  }

  let at = 3
  for (;;) {
    const option = wordOf(list[at])
    if (option === '-f' || option === '-N') {
      at += 1
    } else if (option === '-o' && SAFE_SSH_OPTION.test(wordOf(list[at + 1]) ?? '')) {
      at += 2
    } else if (option === '-L' && FORWARD.test(wordOf(list[at + 1]) ?? '')) {
      at += 2
    } else {
      break
    }
  }

  const id = wordOf(list[at])
  // ssh reads options after the host too, so nothing there may start with `-`.
  const remote = list.slice(at + 1)

  return id && remote.every(token => !('pipe' in token) && !textOf(token).startsWith('-')) ? { lease: { id, config } } : undefined
}

// scp -F <config> [-r] <path in the working tree> <lease id>:<path>: a copy into the lease. A copy
// out of it writes on this host, which the default mode asks for, so it keeps its question.
function scpInto(list: Token[]): AgentCommand | undefined {
  const [command, flag, config] = list.map(wordOf)
  const paths = (wordOf(list[3]) === '-r' ? list.slice(4) : list.slice(3)).map(wordOf)
  const [from, to] = paths
  const id = to?.split(':')[0]

  return command === 'scp' && flag === '-F' && config && isWords(list) && paths.length === 2 && LOCAL_PATH.test(from ?? '') && id && to !== id && WORD.test(id)
    ? { lease: { id, config } }
    : undefined
}

// tar -C <dir> -cf - <path> | ssh ... : a read of the working tree into the lease.
function tarInto(list: Token[]): AgentCommand | undefined {
  const pipe = list.findIndex(token => 'pipe' in token)
  const [command, flag, dir, create, stdout, path] = list.slice(0, pipe).map(wordOf)

  return pipe === 6 && command === 'tar' && flag === '-C' && create === '-cf' && stdout === '-' && [dir, path].every(part => LOCAL_PATH.test(part ?? ''))
    ? ssh(list.slice(pipe + 1))
    : undefined
}

export function agentCommand(command: string): AgentCommand | undefined {
  const list = tokens(command)

  if (!list || list.length === 0) {
    return undefined
  }

  for (const form of [werft, ssh, scpInto, tarInto]) {
    const found = form(list)
    if (found) {
      return found
    }
  }

  return undefined
}
