#!/usr/bin/env python3
"""Print one JSON line per project that `revier events` names, most used first.

Usage: past-use.py [--days <n>] [--local]

The arguments go to `revier events` as they are. A project is ranked by the
number of days on which revier did something in it, then by its `go` count: a
raw `go` count ranks a project that is toggled often above one that is worked
in all day. An `agent session` line is no such day: revier writes one for each
open conversation on each day, for an idle agent too.

A day is a date on the clock of this machine, also for a line that a host in
another time zone recorded.

A link and the project it points to are one row, under the link's name: the
revier on the host records the same agent session under its own name. Links to
the same project of a host are one row too, under the first of their names.

`revier events` prints the oldest event first, so the last event read for a
project is its newest. The times are not compared as text: two machines write
them with two UTC offsets.
"""

import json
import re
import subprocess
import sys
from datetime import datetime


def revier(*args):
    done = subprocess.run(["revier", *args], capture_output=True, text=True)
    sys.stderr.write(done.stderr)
    if done.returncode != 0:
        if "unknown command" in done.stderr:
            sys.exit("STOP: this revier has no `events` command. Tell the user to update revier to 0.13.0 or later.")
        sys.exit(done.returncode)
    return done.stdout


def links():
    """Return the row name of each link, and of each (host, project on that host)."""
    remote_of = {
        view["project"]["name"]: (remote["host"], remote["project"])
        for view in json.loads(revier("list", "--json"))
        if (remote := view["project"].get("remote"))
    }
    row_of_remote = {}
    for name in sorted(remote_of, reverse=True):
        row_of_remote[remote_of[name]] = name
    return {name: row_of_remote[remote] for name, remote in remote_of.items()}, row_of_remote


def local_day(time):
    seconds = re.sub(r"\.\d+", "", time).replace("Z", "+00:00")
    return datetime.fromisoformat(seconds).astimezone().date().isoformat()


def main():
    if sys.argv[1:2] in (["--help"], ["-h"], ["help"]):
        print(__doc__)
        return

    events = [json.loads(line) for line in revier("events", *sys.argv[1:]).split("\n") if line.strip()]
    row_of_link, row_of_remote = links()
    remote_of_row = {name: remote for remote, name in row_of_remote.items()}

    rows = {}
    for position, event in enumerate(events):
        host, project = event.get("host"), event["project"]
        link = row_of_remote.get((host, project)) if host else row_of_link.get(project)
        if link:
            host, host_project = remote_of_row[link]
            identity = {"project": link, "host": host, "host_project": host_project}
        elif host:
            identity = {"project": project, "host": host}
        else:
            identity = {"project": project}

        row = rows.setdefault(
            tuple(identity.items()), {"identity": identity, "days": set(), "events": {}, "sessions": {}}
        )
        row["last"], row["position"] = event["time"], position
        kind = event["event"]
        if kind != "agent session":
            row["days"].add(local_day(event["time"]))
            row["events"][kind] = row["events"].get(kind, 0) + 1
        if "session" in event:
            session = row["sessions"].setdefault(
                event["session"], {"agent": None, "session": event["session"], "dir": None}
            )
            session.update({key: event[key] for key in ("agent", "dir") if key in event})

    ranked = sorted(
        rows.values(),
        key=lambda row: (len(row["days"]), row["events"].get("go", 0), row["position"]),
        reverse=True,
    )
    for row in ranked:
        print(json.dumps({
            **row["identity"],
            "days": sorted(row["days"]),
            "last": row["last"],
            "events": row["events"],
            "sessions": list(row["sessions"].values()),
        }))


if __name__ == "__main__":
    main()
