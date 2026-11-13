// The commands of the werft guide that an agent runs on this host, as the guide writes them:
// werft itself, and ssh, scp and a tar pipe into a lease through the ssh_config of that lease.
// The skill's allowed-tools hold only for the turn that loaded the skill, and a lease answers in a
// later turn, so the mod allows these commands for the whole session.

type Token = { word: string } | { quoted: string } | { pipe: true }

// A word holds no character the shell gives a meaning to; a quoted string runs in the VM alone.
const WORD = /^[A-Za-z0-9_./:=@%+,-]+$/
const LEASE_CONFIG = /^\/[A-Za-z0-9_./-]*\/werft\/leases\/([a-z0-9]+)\/ssh_config$/
const SAFE_SSH_OPTION = /^(?:ExitOnForwardFailure=yes|ConnectTimeout=\d+)$/
const FORWARD = /^\d+:[A-Za-z0-9.-]+:\d+$/
const LOCAL_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9_./@%+,-]+$/

function tokens(command: string): Token[] | undefined {
  const found: Token[] = []
  const pattern = /(\s*)(?:'([^']*)'|(\|)|([^\s'|]+))/y
  let match: RegExpExecArray | null

  while (pattern.lastIndex < command.trimEnd().length && (match = pattern.exec(command))) {
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

  return pattern.lastIndex >= command.trimEnd().length ? found : undefined
}

const wordOf = (token: Token | undefined) => (token && 'word' in token ? token.word : undefined)
const isWords = (list: Token[]) => list.every(token => 'word' in token)

function isWerft(list: Token[]) {
  const [first, second] = list.map(wordOf)

  return first === 'werft' && isWords(list) && (second === '--json' || second === 'guide' || second === 'help')
}

// ssh -F <lease config> [-f] [-N] [-o <safe option>] [-L <forward>] <lease id> [remote command]
function isSsh(list: Token[]) {
  const id = wordOf(list[2])?.match(LEASE_CONFIG)?.[1]

  if (wordOf(list[0]) !== 'ssh' || wordOf(list[1]) !== '-F' || !id) {
    return false
  }

  let at = 3
  for (;;) {
    const flag = wordOf(list[at])
    if (flag === '-f' || flag === '-N') {
      at += 1
    } else if (flag === '-o' && SAFE_SSH_OPTION.test(wordOf(list[at + 1]) ?? '')) {
      at += 2
    } else if (flag === '-L' && FORWARD.test(wordOf(list[at + 1]) ?? '')) {
      at += 2
    } else {
      break
    }
  }

  return wordOf(list[at]) === id && list.slice(at + 1).every(token => !('pipe' in token))
}

// scp -F <lease config> [-r] <from> <to>, one side `<lease id>:<path>`, the other a path in the
// working tree.
function isScp(list: Token[]) {
  const id = wordOf(list[2])?.match(LEASE_CONFIG)?.[1]
  const paths = (wordOf(list[3]) === '-r' ? list.slice(4) : list.slice(3)).map(wordOf)

  if (wordOf(list[0]) !== 'scp' || wordOf(list[1]) !== '-F' || !id || paths.length !== 2 || !isWords(list)) {
    return false
  }

  const inLease = (path: string | undefined) => path?.startsWith(`${id}:`) === true
  const [from, to] = paths

  return inLease(from) !== inLease(to) && [from, to].every(path => inLease(path) || LOCAL_PATH.test(path ?? ''))
}

// tar -C <dir> -cf - <path> | ssh ... : a read of this host into the lease.
function isTarIntoLease(list: Token[]) {
  const pipe = list.findIndex(token => 'pipe' in token)
  const tar = list.slice(0, pipe).map(wordOf)

  return (
    pipe === 6 &&
    tar[0] === 'tar' &&
    tar[1] === '-C' &&
    tar[2] !== undefined &&
    tar[3] === '-cf' &&
    tar[4] === '-' &&
    tar[5] !== undefined &&
    isSsh(list.slice(pipe + 1))
  )
}

export function isAgentCommand(command: string) {
  const list = tokens(command)

  return list !== undefined && list.length > 0 && [isWerft, isSsh, isScp, isTarIntoLease].some(form => form(list))
}
