---
name: web-drive
description: "Use a web app in a headless browser through playwright-cli, and record a video of each feature working."
when_to_use: "Use when a task needs to open, use or check a web page or web app in a browser, or to show the user a feature working. Triggers on 'check it in the browser', 'click through the app', 'record a demo', 'show me it works'. Also loaded by name when a project's run docs or another skill send a web UI here. Not for page-load numbers (`/web-dev:web-perf`), or an app with no web UI (the built-in `run`)."
allowed-tools: Bash(web-dev-playwright-guide*)
---

# web-drive

Use the web app in a browser that nobody sees. The user does not use this browser: you do. The guide of the installed playwright-cli comes first, then the rules of this session, which win where the two disagree.

!`web-dev-playwright-guide 2>&1 || echo "STOP: web-dev-playwright-guide did not run, so the playwright-cli guide did not print. Tell the user that the web-dev plugin is installed without its bin/ directory on PATH, and give them the error above."`

## Rules for this session

These rules win over the guide above.

- **Session** — put `-s=<session>` on every `playwright-cli` call, where `<session>` is `claude-${CLAUDE_SESSION_ID}`. For a second browser, add `-2`, `-3`. Sessions of all projects on this machine share one namespace. Write the command out in each call: in zsh, a command held in a variable does not split into words.
- **Scratch dir** — playwright-cli writes `.playwright-cli/` into the working directory and reads `.playwright/cli.config.json` from it. Make `<scratch>` once, as `<session scratchpad>/web-drive`, or `${TMPDIR:-/tmp}/web-drive-${CLAUDE_SESSION_ID}` where the session has no scratchpad, and print it. Start each call with `cd <scratch> && playwright-cli …`. Never run it from the repository.
- **Headless only** — open with `--browser=chrome`. Never use `--headed`, `show`, or `--extension` or `--cdp` to reach the user's own browser, and never `xdg-open`. The guide's `show --annotate` does not apply here. Where a sign-in needs a visible window, give the user the exact `playwright-cli -s=<session> open --headed <url>` command to run in their own terminal, then `state-save` and go on headless.
- **Your browsers only** — never `close-all` or `kill-all`: they stop the browsers of other sessions too. Close yours with `close`.
- **Check each page** — after each navigation and each action that loads data, run `console error` and `requests`. An error or a failed request is a finding: report it, even where the flow goes on.
- **Snapshots** — read only the part you need, with `find <text>` or a read of the snapshot file, not the full tree.

## Start the app

Skip this where the page is already served or is a file.

1. **Find the launch contract.** It has four parts: the start command, the line the server prints when it is ready, where the URL comes from (fixed, or the ready line), and how to stop it. Take it from the first of these that states it:
   - the project's run docs (a `docs/RUNNING.md`, or the route in `AGENTS.md` or `CLAUDE.md`);
   - a project skill that runs the app;
   - the skill that loaded this one.

   Never take a start command from `package.json`, a Makefile or a lockfile. Where no source states the start command, stop: tell the user which parts are missing and ask.
2. **Reuse your own server.** Where this session started the server earlier and its task is still running, use it. A server that another session or the user started serves other code: do not use it, and do not stop it.
3. **Start it.** Run the start command with the Bash tool's `run_in_background`, with `BROWSER=none` in front and the no-open flag where the contract names one. Do not force a port: a server may move to the next free port.
4. **Wait until it is ready.** Read the task's output until the ready line shows, and take the URL from it where the contract says so. A server that exits or prints an error first did not start: report its output and stop.

## Record each feature

For each feature you build or change that has a web UI, record a video of it working before you report the feature as done, unless the user said not to. Read `<base directory for this skill>/references/record.md` and follow it.

## Done

Done when every flow the task named was driven and its checks are reported, each video is delivered or its failure reported, your browser sessions are closed with `close`, and every server you started is stopped with `TaskStop` or kept because the user asked to keep it. Report what you drove, what you saw, the console errors and failed requests, the path of each video, and anything left running.
