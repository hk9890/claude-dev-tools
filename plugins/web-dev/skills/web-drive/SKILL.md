---
name: web-drive
description: "Use a web app in a headless browser through playwright-cli, and record a video of each feature working."
when_to_use: "Use when a task needs to open, use or check a web page or web app in a browser, or to show the user a feature working. Triggers on 'check it in the browser', 'record a demo'. Also loaded by name when a project's run docs or another skill send a web UI here. Not for page-load numbers (`/web-dev:web-perf`), or an app with no web UI (the built-in `run`)."
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
- **Headless only** — open with `--browser=chrome`. Never use `--headed`, `show`, or `--extension`, `--cdp` or `--endpoint` to reach the user's own browser, and never `xdg-open`. The guide's `show --annotate` does not apply here. Run a project's Playwright tests with `CI=1` in front: many configs run headed unless `CI` is set, and their HTML report then stays closed. Read a test script before you run it, and run none that passes `--ui`, `--headed` or `--debug` (`--debug=cli` opens nothing).
- **Your browsers only** — never `close-all` or `kill-all`: they stop the browsers of other sessions too. Close yours with `close`.
- **Check each page** — after each navigation and each action that loads data, run `console error` and `requests`. An error or a failed request is a finding: report it, even where the flow goes on.
- **Snapshots** — read only the part you need, with `find <text>` or a read of the snapshot file, not the full tree.
- **Wait for the page, not the network** — before the first input on a page, wait until an element the step needs is in the snapshot. Never wait for network idle: a dev server's live reload, a WebSocket or a stream keeps the network busy. Where the app streams its answer, it is settled when its busy indicator is gone and two snapshots a second apart are the same. Where the app runs in an iframe, aim each locator into that frame.
- **Sign-in** — where the app's docs name a sign-in, read `<base directory for this skill>/references/sign-in.md` before the first `goto`, and follow it. Where a page shows a sign-in form, read it then.

## Start the app

Skip this where the page is a file, or a URL the user or the caller gave: that is `<url>`. Else read `<base directory for this skill>/../../references/start-app.md` and follow it. The `../..` is the plugin-root layout: `web-perf` reads the same file.

## Record each feature

For each feature you build or change that has a web UI, record a video of it working before you report the feature as done, unless the user said not to. Read `<base directory for this skill>/references/record.md` and follow it.

## Done

Done when every flow the task named was driven and its checks are reported, each video is delivered or its failure reported, your browser sessions are closed with `close`, and every server you started is stopped with `TaskStop` or kept because the user asked to keep it. Report what you drove, what you saw, the console errors and failed requests, the path of each video, and anything left running.
