#!/usr/bin/env python3
"""Print one JSON line per project that a word names, for each word given.

Usage: find-project.py <word>..

A word names a project where it is part of, in any case:

- `name`: the project's name, the name `revier list --json` takes.
- `dir`: the last part of its checkout path.
- `repo`: the repository name in its git URL.
- `host_project`: for a link, the project's name on its host.
- `agent`: the activity of one of its agents, or the harness's name of
  one, whole: a harness names an agent after its project.

Each line gives the `word`, the `project`, the `matched` fields, and for an
`agent` match the `agents` it matched, each with its `address` where it has
one. A word that names no project prints one line with `project` null.
"""

import json
import os
import re
import subprocess
import sys


def projects():
    done = subprocess.run(["revier", "list", "--json"], capture_output=True, text=True)
    sys.stderr.write(done.stderr)
    if done.returncode != 0:
        sys.exit(done.returncode)
    return json.loads(done.stdout)


def repo(git_url):
    return re.sub(r"\.git$", "", git_url.rstrip("/")).rsplit("/", 1)[-1].rsplit(":", 1)[-1]


def address(name, agent):
    return f"{name}:{agent['target']}:{agent['panel']}" if agent.get("target") else None


def matches(word, view):
    project = view["project"]
    fields = {
        "name": project["name"],
        "dir": os.path.basename(project["path"].rstrip("/")),
        "repo": repo(project.get("git_url", "")),
        "host_project": project.get("remote", {}).get("project", ""),
    }
    matched = [field for field, value in fields.items() if word in value.lower()]
    agents = [
        {
            "address": address(project["name"], agent),
            "activity": agent["state"].get("activity"),
            "name": agent["state"].get("name"),
            "status": agent["state"]["status"],
        }
        for agent in view.get("agents", [])
        if word in agent["state"].get("activity", "").lower()
        or word == agent["state"].get("name", "").lower()
    ]
    if agents:
        matched.append("agent")
    return matched, agents


def main():
    words = sys.argv[1:]
    if not words or words[0] in ("--help", "-h", "help"):
        print(__doc__)
        return

    views = projects()
    for word in words:
        found = False
        for view in views:
            matched, agents = matches(word.lower(), view) if word else ([], [])
            if matched:
                found = True
                line = {"word": word, "project": view["project"]["name"], "matched": matched}
                if agents:
                    line["agents"] = agents
                print(json.dumps(line))
        if not found:
            print(json.dumps({"word": word, "project": None}))


if __name__ == "__main__":
    main()
