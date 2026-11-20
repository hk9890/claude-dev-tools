---
name: web-drive
description: "Use a web app in a headless browser through playwright-cli, and record a video of each feature working."
when_to_use: "Use when a task needs to open, use or check a web page or web app in a browser, or to show the user a feature working. Triggers on 'check it in the browser', 'click through the app', 'record a demo', 'show me it works'. Also loaded by name when a project's run docs or another skill send a web UI here. Not for page-load numbers (`/web-dev:web-perf`), or an app with no web UI (the built-in `run`)."
allowed-tools: Bash(web-dev-playwright-guide*)
---

# web-drive

Use the web app in a browser that nobody sees. The user does not use this browser: you do. The guide of the installed playwright-cli comes first, then the rules of this session.

!`web-dev-playwright-guide 2>&1 || echo "STOP: web-dev-playwright-guide did not run, so the playwright-cli guide did not print. Tell the user that the web-dev plugin is installed without its bin/ directory on PATH, and give them the error above."`

Read a file the guide links to from the `Guide directory:` path.

## Rules for this session

These rules win over the guide above, and over a project skill or doc that drives a browser: take only the app's facts from those (URLs, selectors, what to wait for), and keep these rules for the browser itself.

- **Session** — put `-s=<session>` on every `playwright-cli` call, where `<session>` is `claude-${CLAUDE_SESSION_ID}`. A subagent has its parent's session id: in a subagent, add `-` and a short word of your task to `<session>` and to `<scratch>`. For a second browser, add `-2`, `-3`. Sessions of all projects on this machine share one namespace. Write the command out in each call: in zsh, a command held in a variable does not split into words.
- **Scratch dir** — playwright-cli writes `.playwright-cli/` into the working directory and reads `.playwright/cli.config.json` from it. Make `<scratch>` once, as `<session scratchpad>/web-drive`, or `${TMPDIR:-/tmp}/web-drive-${CLAUDE_SESSION_ID}` where the session has no scratchpad, and print it. Start each call with `cd <scratch> && playwright-cli …`. Never run it from the repository.
- **Headless only** — open with `--browser=chrome`. Never use `--headed`, `show`, or `--extension`, `--cdp` or `--endpoint` to reach the user's own browser, and never `xdg-open`. The guide's `show --annotate` does not apply here. Run a project's Playwright tests with `CI=1` in front: many configs run headed unless `CI` is set, and their HTML report then stays closed. Read a test script before you run it, and run none that passes `--ui`, `--headed` or `--debug`.
- **Your browsers only** — never `close-all` or `kill-all`: they stop the browsers of other sessions too. Close yours with `close`.
- **Check each page** — after each navigation and each action that loads data, run `console error` and `requests`. An error or a failed request is a finding: report it, even where the flow goes on.
- **Snapshots** — read only the part you need, with `find <text>` or a read of the snapshot file, not the full tree.
- **Wait for the page, not the network** — before the first input on a page, wait until an element the step needs is in the snapshot. Never wait for network idle: a dev server's live reload, a WebSocket or a stream keeps the network busy. Where the app streams its answer, it is settled when its busy indicator is gone and two snapshots a second apart are the same. Where the app runs in an iframe, aim each locator into that frame.
- **Sign-in** — keep one sign-in state per project, across sessions, at `<state>`: `${XDG_CACHE_HOME:-$HOME/.cache}/web-dev/<project>/state.json`, where `<project>` is the name of the directory that `git rev-parse --path-format=absolute --git-common-dir` sits in. Make its directory with mode 700 and the file with mode 600, and print the path. Where `<state>` exists, `state-load <state>` after `open`, then `goto <url>`. Where the app shows a sign-in page instead, the state is missing or expired: give the user the exact `cd <scratch> && playwright-cli -s=<session> open --headed <url>` to run in their own terminal, and wait for them. Once they have signed in, run `state-save <state>`, `close`, `open --browser=chrome`, `state-load <state>` and `goto <url>`.

## Start the app

Skip this where the page is a file, or a URL the user or the caller gave.

1. **Find the launch contract.** It has four parts: the start command, the line the server prints when it is ready, where the URL comes from (fixed, or the ready line), and how to stop it. Two more parts are optional: how long the first start may take, and a line that asks the user to act before the server is ready, such as a URL to open for a sign-in. Take it from the first of these that states it:
   - the project's run docs (a `docs/RUNNING.md`, or the route in `AGENTS.md` or `CLAUDE.md`);
   - a project skill that runs the app;
   - the skill that loaded this one.

   Never take a start command from `package.json`, a Makefile or a lockfile. Where no source states the start command, stop: tell the user which parts are missing and ask. Where the server opens a browser on start (its docs or its `--help` say so) and the contract names no flag that stops it, stop and ask for that flag: `BROWSER=none` stops only some tools.
2. **Reuse your own server.** Where this session started the server earlier and its task is still running, use it. A server that another session or the user started serves other code: do not use it, and do not stop it.
3. **Start it.** Run `export BROWSER=none; <start command>` with the Bash tool's `run_in_background`, with the no-open flag where the contract names one: an export reaches every command of a compound start command. Do not force a port: a server may move to the next free port.
4. **Wait until it is ready.** Read the task's output until the ready line shows, and take the URL from it where the contract says so. Where the line that asks the user to act shows first, give the user that line and keep waiting. Wait as long as the contract says, else 3 minutes. A server that exits, prints an error or is not ready in time did not start: report its output, stop it with `TaskStop`, and stop.

## Record each feature

For each feature you build or change that has a web UI, record a video of it working before you report the feature as done, unless the user said not to. Read `<base directory for this skill>/references/record.md` and follow it.

## Done

Done when every flow the task named was driven and its checks are reported, each video is delivered or its failure reported, your browser sessions are closed with `close`, and every server you started is stopped with `TaskStop` or kept because the user asked to keep it. Report what you drove, what you saw, the console errors and failed requests, the path of each video, and anything left running.
