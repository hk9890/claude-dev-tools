# Sign in

Keep one sign-in state per project, across sessions, so the user signs in once and not in every session.

1. **Find the state.** `<state>` is `${XDG_CACHE_HOME:-$HOME/.cache}/web-dev/<project>/state.json`, where `<project>` is `$(basename "$d")-$(printf %s "$d" | cksum | cut -d' ' -f1)`, with `d` the directory that `git rev-parse --path-format=absolute --git-common-dir` sits in, or the working directory outside a repository. Make its directory with mode 700, and print the path.
2. **Load it.** Where `<state>` exists, run `state-load <state>` after `open`, then `goto <url>`.
3. **Hand the sign-in to the user.** Where the app shows a sign-in page instead, the state is missing or expired. Give the user the exact `cd <scratch> && playwright-cli -s=<session> open --headed <url>` to run in their own terminal, and wait for them.
4. **Save it.** Once they have signed in, run `state-save <state>`, `chmod 600 <state>`, `close`, `open --browser=chrome`, `state-load <state>` and `goto <url>`.
