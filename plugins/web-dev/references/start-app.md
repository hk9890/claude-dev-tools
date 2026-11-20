# Start the app

How `web-drive` and `web-perf` start a project's web server. Both skills read this file.

1. **Find the launch contract.** It has four parts: the start command, the line the server prints when it is ready, where the URL comes from (fixed, or the ready line), and how to stop it. Two more parts are optional: how long the first start may take, and a line that asks the user to act before the server is ready, such as a URL to open for a sign-in. Take it from the first of these that states it:
   - the project's run docs (a `docs/RUNNING.md`, or the route in `AGENTS.md` or `CLAUDE.md`);
   - a project skill that runs the app;
   - the skill that sent you here.

   Never take a start command from `package.json`, a Makefile or a lockfile. Where no source states the start command, stop: tell the user which parts are missing and ask. Where the server opens a browser on start (its docs or its `--help` say so) and the contract names no flag that stops it, stop and ask for that flag: `BROWSER=none` stops only some tools.
2. **Reuse your own server.** Where this session started the server earlier and its task is still running, use it. A server that another session or the user started serves other code: do not use it, and do not stop it.
3. **Start it.** Run `export BROWSER=none; <start command>` with the Bash tool's `run_in_background`, with the no-open flag where the contract names one: an export reaches every command of a compound start command. Do not force a port: a server may move to the next free port.
4. **Wait until it is ready.** Read the task's output until the ready line shows. `<url>` is the URL it names where the contract says so, else the contract's fixed URL: print it. Where the line that asks the user to act shows first, give the user that line and keep waiting. Wait as long as the contract says, else 3 minutes. A server that exits, prints an error or is not ready in time did not start: report its output, stop it with `TaskStop`, and stop.
