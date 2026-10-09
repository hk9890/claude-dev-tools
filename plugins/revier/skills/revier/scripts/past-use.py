#!/usr/bin/env python3
"""Print one JSON line per project that `revier events` names, most used first.

Usage: past-use.py [--days <n>] [--local]

The arguments go to `revier events` as they are. A project is ranked by the
number of days with an event, then by its `go` count: a raw `go` count ranks a
project that is toggled often above one that is worked in all day.

A link and the project it points to are one row, under the link's name: the
revier on the host records the same agent session under its own name.
"""

import json
import subprocess
import sys


def revier(*args):
    done = subprocess.run(["revier", *args], capture_output=True, text=True)
    sys.stderr.write(done.stderr)
    if done.returncode != 0:
        if "unknown command" in done.stderr:
            sys.exit("STOP: this revier has no `events` command. Tell the user to update revier to 0.13.0 or later.")
        sys.exit(done.returncode)
    return done.stdout


def links():
    """Map (host, project on that host) to the name of the link to it."""
    return {
        (remote["host"], remote["project"]): view["project"]["name"]
        for view in json.loads(revier("list", "--json"))
        if (remote := view["project"].get("remote"))
    }


def main():
    events = [json.loads(line) for line in revier("events", *sys.argv[1:]).splitlines() if line.strip()]
    link_of = links()
    host_of = {name: host for (host, _), name in link_of.items()}

    rows = {}
    for event in events:
        host, project = event.get("host"), event["project"]
        if (host, project) in link_of:
            project = link_of[(host, project)]
            host = None
        if host is None:
            host = host_of.get(project)

        row = rows.setdefault((host, project), {"days": set(), "events": {}, "sessions": {}, "last": ""})
        row["days"].add(event["time"][:10])
        row["last"] = max(row["last"], event["time"])
        kind = event["event"]
        if kind == "agent session":
            row["sessions"].setdefault(
                event["session"],
                {"agent": event.get("agent"), "session": event["session"], "dir": event.get("dir")},
            )
        else:
            row["events"][kind] = row["events"].get(kind, 0) + 1

    ranked = sorted(
        rows.items(),
        key=lambda item: (len(item[1]["days"]), item[1]["events"].get("go", 0), item[1]["last"]),
        reverse=True,
    )
    for (host, project), row in ranked:
        out = {"project": project}
        if host:
            out["host"] = host
        out["days"] = sorted(row["days"])
        out["last"] = row["last"]
        out["events"] = row["events"]
        out["sessions"] = list(row["sessions"].values())
        print(json.dumps(out))


if __name__ == "__main__":
    main()
