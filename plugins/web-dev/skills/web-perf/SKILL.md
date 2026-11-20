---
name: web-perf
description: "Measure how fast a web page loads: chrome-devtools traces under throttling, and a Lighthouse performance score."
user-invocable: true
disable-model-invocation: true
argument-hint: "[page-or-url] [--compare <git-ref>]"
---

**Measure page load.** Scope: $ARGUMENTS

With no page, ask the user which page to measure. With `--compare <git-ref>`, measure that ref first, then the working tree, and report both.

## 1. Check the tools

Run `command -v chrome-devtools lighthouse`. Without `chrome-devtools`, stop: tell the user it installs with `npm install -g chrome-devtools-mcp`. Without `lighthouse`, measure the traces only, and report that the score was skipped because `lighthouse` (`npm install -g lighthouse`) is not on PATH.

Run `chrome-devtools status`. Where it is running, another session may be using it, and `start` restarts it: ask the user before you go on.

Make `<scratch>` as `<session scratchpad>/web-perf`, or `${TMPDIR:-/tmp}/web-perf-${CLAUDE_SESSION_ID}` where the session has no scratchpad, and print it. Traces and reports go there.

## 2. Serve a production build

Measure a production build, never the dev server: a dev server sends unbundled, unminified code. Take the build command and the command that serves the build from the project's run docs, as `web-dev:web-drive` takes the launch contract: call the Skill tool with `web-dev:web-drive`, even where it loaded earlier in this session, and follow its "Start the app" steps with these two commands. Where the docs name no build or no way to serve it, stop and tell the user which is missing.

For `--compare`, build the ref in its own worktree (`git worktree add <scratch>/base <git-ref>`), serve one build at a time, and take each URL from its own ready line.

## 3. Trace

```bash
CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS=1 chrome-devtools start --headless --isolated --performanceCrux=false
chrome-devtools navigate_page 1 --url <url>
chrome-devtools emulate 1 --cpuThrottlingRate 4 --networkConditions "Fast 4G"
chrome-devtools performance_start_trace 1 --reload true --autoStop true --ignoreCache true --filePath <scratch>/trace-<n>.json.gz
```

`--performanceCrux=false` keeps the page URLs on this machine. `emulate` replaces all its settings on each call: set the CPU and the network in one call. Run the trace 5 times. For each run, keep LCP, CLS and the insights the trace names. Read the insight with the largest saving with `chrome-devtools performance_analyze_insight 1 <insight set id> <insight name>`, both as the trace names them (`NAVIGATION_0 RenderBlocking`).

## 4. Score

```bash
lighthouse <url> --only-categories=performance --chrome-flags="--headless=new" --output=json --output-path=<scratch>/lighthouse-<n>.json --quiet
```

Run it 3 times and keep the median score. Lighthouse simulates its throttling, while the trace in step 3 applies real throttling: never put their numbers in one table.

## 5. Report and clean up

Run `chrome-devtools stop`, stop each server you started with `TaskStop`, and for `--compare` run `git worktree remove --force <scratch>/base`.

Report two tables: the trace medians (LCP, CLS) and the Lighthouse medians (score, LCP, TBT, CLS), each with a before and after column for `--compare`. Add the top insights. State that the numbers come from throttling on this machine, that they compare only with runs on this machine, and that every run measured a cold load.

Done when both tables are reported, or a skipped part and the reason for it are reported, and nothing you started is still running.
