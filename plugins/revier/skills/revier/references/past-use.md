# Past use

Run the script of this skill, unless the Scripts line of the skill shows no python3: then run `revier events` after `revier events --help`. Its arguments are those of `revier events`:

```bash
python3 "<base directory for this skill>/scripts/past-use.py" --days <n>
```

It prints one JSON line per project, most used first: the project with more `.days`, then the one with more `go` presses. Each line gives:

- `.project`, and `.host` for a project on a linked host. A link and the project it points to are one line, under the name of the link, with `.host_project` for its name on that host.
- `.days`: the days, on the clock of this machine, on which revier did something there. A project with `.sessions[]` and no `.days` had an agent open that revier was not asked to show: report it apart, as open and not as worked in.
- `.last`: the time of the newest event.
- `.events`: a count per kind, except `agent session`, which `.sessions[]` carries. `revier events --help` says what each kind records.
- `.sessions[]`: each conversation an agent held there, with its `.agent`, `.session` and `.dir`.

A warning on stderr names a linked host that gave no events: report that its projects are missing from the answer.

To act on the projects, for example to list the pull requests the user opened in them, take each checkout from `revier list --json <name>..` and run `git` or `gh` there under the rules of "Another project's source" in the skill. A line with `.host` and no `.host_project` is a project of that host with no link here, so it has no checkout here: report it by name and host.

A conversation of a Claude agent on this machine is the transcript that `find ~/.claude/projects -name '<session>.jsonl'` prints; no output means it is not on this machine. The format of a transcript is internal to Claude Code and can change. A conversation on a line with `.host` is on that host, out of reach from here.
