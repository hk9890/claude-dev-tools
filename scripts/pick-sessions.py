#!/usr/bin/env python3
"""Pick Claude Code sessions worth a review, and keep each review run.

pick    starts a run folder in the review store: picks the sessions that used a plugin of
        this marketplace and that no earlier run reviewed, a few from each bucket (most
        user pushback, most tool errors, most output tokens, a plugin the last release
        changed, random), and copies their transcripts into the run. With --host it
        picks the sessions of another machine: it mirrors that machine's transcripts
        over ssh with rsync first.
        It also writes what this repository put into the context of every session in the
        window, with the reads and the trouble that followed (context.json, context.md).
render  prints one transcript as text an agent can read in parts.
record  writes the findings of a review into its run folder.
context prints the context cost of each file over the runs of the review store.

The review store is the directory in SESSION_REVIEW_DIR, a checkout of a private repository.
"""

import argparse
import bisect
import json
import os
import random
import re
import shlex
import shutil
import socket
import subprocess
import sys
import time
from collections import defaultdict
from datetime import datetime
from pathlib import Path, PurePosixPath

REPO_ROOT = Path(__file__).resolve().parent.parent

# Results with is_error set where no tool failed: Claude Code refused a command it
# could not prove stays in the worktree, or skipped the siblings of an interrupted batch.
# The refusal opens "This session is isolated" in a session and "This agent is isolated"
# in a subagent. Claude Code wraps some of its own errors in ERROR_TAG.
ISOLATION_REFUSAL = "is isolated in the worktree"
CANCELLED_SIBLING = "Cancelled: parallel tool call"
ERROR_TAG = "<tool_use_error>"

INTERRUPT = "[Request interrupted by user"
# One interrupt writes several records in the same second: a marker, a rejection for each
# call of a parallel batch, and a marker in each subagent it stopped.
TIMESTAMP_SECOND = len("2026-01-01T00:00:00")

# The banner Claude Code writes when it loads a skill. A cached install has the plugin
# version in the path (<plugin>/<version>/skills/<skill>); a checkout of this repository
# has none (plugins/<plugin>/skills/<skill>).
BANNER_RE = re.compile(r"Base directory for this skill:\s*(\S+)/skills/([A-Za-z0-9_-]+)")
VERSION_RE = re.compile(r"\d+\.\d+\.\d+")
RELEASE_TAG_RE = re.compile(f"v{VERSION_RE.pattern}")
WORKTREE_RE = re.compile(r"/\.claude/worktrees/([^/]+)/")
SLASH_COMMAND_RE = re.compile(r"<command-name>/([^<\s]+)</command-name>")

RANKED_BUCKETS = ("pushback", "errors", "output_tokens")

# GitHub refuses a file above 100 MB, so a session that holds one is not picked.
REFUSED_TRANSCRIPT_MB = 100
LARGE_TRANSCRIPT_MB = 50

# The host names a folder of the mirror and of the run, so it holds no path separator.
HOST_RE = re.compile(r"[A-Za-z0-9_][A-Za-z0-9._@-]*")
# Each host's transcripts, mirrored here so that the next pick copies only what changed.
MIRROR_DIR = Path(os.environ.get("XDG_CACHE_HOME") or Path.home() / ".cache") / "claude-dev-tools" / "session-mirrors"
# rsync exits 24 where a file vanished on the host while it ran: the host deleted it, and the mirror holds the rest.
RSYNC_VANISHED = 24

# An entry of the skill or agent listing Claude Code puts into each context: "- <name>: <text>".
LISTING_ENTRY_RE = re.compile(r"^- ([^\s:]+(?::[^\s:]+)?): ", re.M)
EDIT_TOOLS = ("Edit", "Write", "NotebookEdit")
# The ways a text of this repository reaches a context, each read from a record of its own kind.
CHANNELS = ("listing", "skill-body", "skill-reinjected", "instructions", "read")
CONTEXT_TOP = 30


def records(path):
    with open(path, encoding="utf-8", errors="replace") as lines:
        for line in lines:
            try:
                record = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(record, dict):
                yield record


def blocks(record):
    message = record.get("message")
    content = message.get("content") if isinstance(message, dict) else None
    if isinstance(content, str):
        return [{"type": "text", "text": content}]
    return [b for b in content or [] if isinstance(b, dict)]


def block_text(block):
    content = block.get("text", block.get("content", ""))
    if isinstance(content, list):
        return "\n".join(c.get("text", "") for c in content if isinstance(c, dict))
    return content if isinstance(content, str) else ""


def subagent_files(session_file):
    return sorted(session_file.with_suffix("").glob("subagents/**/agent-*.jsonl"))


def skill_load(text, plugins):
    """The skill a banner loads and the version label of its plugin, for a plugin in `plugins`."""
    banner = BANNER_RE.match(text)
    if not banner:
        return None
    root = Path(banner[1])
    if VERSION_RE.fullmatch(root.name):
        plugin, label = root.parent.name, root.name
    else:
        worktree = WORKTREE_RE.search(banner[1])
        plugin, label = root.name, (f"dev@{worktree[1]}" if worktree else "dev@main")
    if plugin not in plugins:
        return None
    return f"{plugin}:{banner[2]}", plugin, label


def summarize(session_file, plugins):
    """One session with its subagent transcripts: the pick record, and the use of each skill."""
    subagents = subagent_files(session_file)
    copied = [session_file, *(f for f in (session_file.with_suffix("") / "subagents").rglob("*") if f.is_file())]
    pushback_seconds = set()
    tokens_by_message = {}
    errors = 0
    started = ended = None
    # A subagent turn has no banner of its own: it runs the version its session loaded last.
    session_loads = []
    usage = defaultdict(lambda: {
        "versions": set(), "turns": 0, "model_invoked": 0, "slash_invoked": 0,
        "by_version": defaultdict(lambda: {"turns": 0, "failed": 0, "rejected": 0}),
    })

    def owned(skill):
        return isinstance(skill, str) and ":" in skill and skill.split(":")[0] in plugins

    for path in [session_file, *subagents]:
        loaded = {}
        # The skill turn that made each tool call, to give its result to the same skill and version.
        call_owner = {}
        for record in records(path):
            timestamp = record.get("timestamp") or ""
            started = started or record.get("timestamp")
            ended = max(ended or "", timestamp)
            if record.get("type") == "assistant":
                skill, plugin = record.get("attributionSkill"), record.get("attributionPlugin")
                if skill and plugin in plugins:
                    label = (
                        loaded.get(skill)
                        or loaded.get(plugin)
                        or next((l for at, name, _, l in reversed(session_loads) if at <= timestamp and name == skill), None)
                        or next((l for at, _, name, l in reversed(session_loads) if at <= timestamp and name == plugin), None)
                        or "unknown"
                    )
                    usage[skill]["versions"].add(label)
                    usage[skill]["turns"] += 1
                    usage[skill]["by_version"][label]["turns"] += 1
                for block in blocks(record):
                    invoked = (block.get("input") or {}).get("skill") if block.get("name") == "Skill" else None
                    if owned(invoked):
                        usage[invoked]["model_invoked"] += 1
                    if block.get("type") == "tool_use" and skill and plugin in plugins:
                        call_owner[block.get("id")] = (skill, label)
                # One API message spans several records, and its usage grows up to the last.
                message = record.get("message") or {}
                message_id = message.get("id")
                tokens = (message.get("usage") or {}).get("output_tokens", 0)
                tokens_by_message[message_id] = max(tokens_by_message.get(message_id, 0), tokens)
            elif record.get("type") == "user":
                denial = record.get("toolDenialKind")
                second = timestamp[:TIMESTAMP_SECOND]
                for block in blocks(record):
                    text = block_text(block)
                    if block.get("type") == "text":
                        if text.startswith(INTERRUPT):
                            pushback_seconds.add(second)
                        # The user types in the session only: a workflow subagent repeats the request that started it.
                        if path == session_file:
                            for command in SLASH_COMMAND_RE.findall(text):
                                if owned(command):
                                    usage[command]["slash_invoked"] += 1
                        load = skill_load(text, plugins)
                        if load:
                            skill, plugin, label = load
                            loaded[skill] = loaded[plugin] = label
                            if path == session_file:
                                session_loads.append((timestamp, skill, plugin, label))
                    elif block.get("type") == "tool_result" and block.get("is_error"):
                        owner = call_owner.get(block.get("tool_use_id"))
                        if denial == "user-rejected":
                            pushback_seconds.add(second)
                            if owner:
                                usage[owner[0]]["by_version"][owner[1]]["rejected"] += 1
                        elif not (
                            denial
                            or ISOLATION_REFUSAL in text.lower()
                            or text.removeprefix(ERROR_TAG).startswith(CANCELLED_SIBLING)
                        ):
                            errors += 1
                            if owner:
                                usage[owner[0]]["by_version"][owner[1]]["failed"] += 1

    skill_versions = {skill: sorted(use["versions"]) for skill, use in sorted(usage.items()) if use["turns"]}
    session = {
        "session_id": session_file.stem,
        "session": str(session_file),
        "project": session_file.parent.name,
        "started": started,
        "ended": ended,
        "largest_file_mb": max(f.stat().st_size for f in copied) >> 20,
        "skills": list(skill_versions),
        "versions": sorted({label for labels in skill_versions.values() for label in labels}),
        "skill_versions": skill_versions,
        "subagents": len(subagents),
        "pushback": len(pushback_seconds),
        "errors": errors,
        "output_tokens": sum(tokens_by_message.values()),
    }
    return session, usage


def last_release(plugins_dir):
    """The newest release tag, the one before it, and the files that differ between them, by plugin."""

    def git(*argv, check=False):
        done = subprocess.run(["git", "-C", str(plugins_dir.parent), *argv], capture_output=True, text=True, check=check)
        return done.stdout.splitlines()

    # --no-column, core.quotePath and --no-renames pin what user config changes: tags in
    # columns, a non-ASCII path in quotes, and a file that moved to another plugin listed
    # under the new plugin only.
    tags = [tag for tag in git("tag", "--list", "--no-column", "--sort=-version:refname") if RELEASE_TAG_RE.fullmatch(tag)]
    if len(tags) < 2:
        return None
    version, previous = tags[:2]
    changed = defaultdict(list)
    # A diff that failed must stop the pick: no output reads as a release that changed no plugin.
    paths = git("-c", "core.quotePath=false", "diff", "--name-only", "--no-renames", previous, version, "--", plugins_dir.name, check=True)
    for path in paths:
        plugin, *rest = Path(path).parts[1:]
        # A release bumps the version in every plugin.json, and no session runs a test.
        if rest and rest[0] != "tests" and rest != [".claude-plugin", "plugin.json"]:
            changed[plugin].append(path)
    return {"version": version[1:], "previous": previous[1:], "changed": dict(changed)}


def released_skills(session, release):
    """The skills this session ran at the release version."""
    return [skill for skill, labels in session["skill_versions"].items() if release["version"] in labels]


def usage_table(usages, plugins_dir, since_days):
    total = defaultdict(lambda: {"sessions": 0, "versions": set(), "turns": 0, "model_invoked": 0, "slash_invoked": 0})
    for usage in usages:
        for skill, use in usage.items():
            total[skill]["sessions"] += 1
            total[skill]["versions"] |= use["versions"]
            for count in ("turns", "model_invoked", "slash_invoked"):
                total[skill][count] += use[count]

    lines = [
        "# Skill usage",
        "",
        f"The {len(usages)} sessions of the last {since_days:g} days that used a plugin of this marketplace, subagent transcripts included.",
        "",
        "| Skill | Sessions | Turns | Model-invoked | Slash-invoked | Versions |",
        "|---|---|---|---|---|---|",
    ]
    for skill, use in sorted(total.items()):
        lines.append(
            f"| `{skill}` | {use['sessions']} | {use['turns']} | {use['model_invoked']} | {use['slash_invoked']} | {', '.join(sorted(use['versions']))} |"
        )
    shipped = {f"{p.parent.parent.parent.name}:{p.parent.name}" for p in plugins_dir.glob("*/skills/*/SKILL.md")}
    lines += ["", "## Skills with no use in the window", ""]
    lines += [f"- `{skill}`" for skill in sorted(shipped - set(total))] or ["None."]
    return "\n".join(lines) + "\n"


class Repository:
    """How a path in a transcript names a file of this repository, on any machine."""

    def __init__(self, plugins_dir):
        root = plugins_dir.parent
        self.plugins = {p.name for p in plugins_dir.iterdir() if p.is_dir()}
        self.marketplace = json.loads((root / ".claude-plugin" / "marketplace.json").read_text(encoding="utf-8"))["name"]
        # A checkout loads AGENTS.md as project instructions: one whose first line is this
        # repository's names the checkout's root, wherever that machine keeps it.
        agents = root / "AGENTS.md"
        self.agents_title = agents.read_text(encoding="utf-8").partition("\n")[0] if agents.is_file() else None
        # A checkout also holds files git ignores, scratch folders among them: they are no part of it.
        tracked = subprocess.run(["git", "-C", str(root), "ls-files"], capture_output=True, text=True, check=True).stdout
        self.top_level = {path.partition("/")[0] for path in tracked.splitlines()}

    def root_of(self, instruction):
        path, content = instruction.get("path") or "", instruction.get("content") or ""
        if self.agents_title and path.endswith("/AGENTS.md") and content.partition("\n")[0] == self.agents_title:
            return path.removesuffix("/AGENTS.md")
        return None

    def file(self, path, roots):
        """The repository path of an absolute path, or None for a file of no checkout or install of it."""
        parts = PurePosixPath(path).parts
        for i in range(len(parts) - 2):
            if parts[i : i + 3] == ("plugins", "cache", self.marketplace):
                # An install: <plugin>/<version>/<file of the plugin>
                plugin, rest = parts[i + 3 : i + 4], parts[i + 5 :]
                return str(PurePosixPath("plugins", plugin[0], *rest)) if plugin and plugin[0] in self.plugins and rest else None
            if parts[i : i + 3] == ("plugins", "marketplaces", self.marketplace):
                return str(PurePosixPath(*parts[i + 3 :])) if parts[i + 3 :] else None
        for root in sorted(roots, key=len, reverse=True):
            if path.startswith(root + "/"):
                rest = PurePosixPath(path[len(root) + 1 :]).parts
                # A worktree of the checkout, in the layout Claude Code keeps them in.
                if rest[:2] == (".claude", "worktrees"):
                    rest = rest[3:]
                return str(PurePosixPath(*rest)) if rest and rest[0] in self.top_level else None
        return None

    def skill_file(self, text):
        load = skill_load(text, self.plugins)
        if not load:
            return None
        plugin, skill = load[0].split(":")
        return f"plugins/{plugin}/skills/{skill}/SKILL.md"

    def listed_file(self, name):
        plugin, _, rest = name.partition(":")
        if plugin not in self.plugins or not rest:
            return None
        return f"plugins/{plugin}/skills/{rest}/SKILL.md"


def listing_entries(text):
    starts = list(LISTING_ENTRY_RE.finditer(text))
    for entry, after in zip(starts, [*starts[1:], None]):
        yield entry[1], (after.start() if after else len(text)) - entry.start()


def agent_type(transcript):
    meta = transcript.with_suffix(".meta.json")
    if not meta.is_file():
        return None
    try:
        return json.loads(meta.read_text(encoding="utf-8")).get("agentType")
    except json.JSONDecodeError:
        return None


def context_of(transcript, repo, roots):
    """What one transcript put into its context from this repository, and the reads and edits after it.

    Each text is weighed by the API calls that carried it: those after it, up to the next
    compaction, which drops the conversation and loads a summary instead.
    """
    roots = set(roots)
    texts = []  # (record index, channel, file, chars)
    reads = []  # (record index, file, offset, limit)
    loads = []  # (record index, skill file)
    # A Read result comes after its call, in a record of its own: its size is what the file put in context.
    read_calls = {}
    edits = []  # record index of each edit of a file of this repository
    calls, compactions, seen = [], [], set()
    index = -1
    for index, record in enumerate(records(transcript)):
        kind = record.get("type")
        if kind == "assistant":
            message = record.get("message") or {}
            if message.get("id") not in seen:
                seen.add(message.get("id"))
                calls.append(index)
            for block in blocks(record):
                if block.get("type") != "tool_use":
                    continue
                arguments = block.get("input") or {}
                file = repo.file(arguments.get("file_path") or arguments.get("notebook_path") or "", roots)
                if block.get("name") == "Read" and file:
                    reads.append((index, file, arguments.get("offset"), arguments.get("limit")))
                    read_calls[block.get("id")] = file
                elif block.get("name") in EDIT_TOOLS and file:
                    edits.append(index)
        elif kind == "system" and record.get("subtype") == "compact_boundary":
            compactions.append(index)
        elif kind == "attachment":
            attachment = record.get("attachment") or {}
            if attachment.get("type") == "instructions":
                instructions = attachment.get("files") or []
                roots |= {root for root in map(repo.root_of, instructions) if root}
                for instruction in instructions:
                    file = repo.file(instruction.get("path") or "", roots)
                    if file:
                        texts.append((index, "instructions", file, len(instruction.get("content") or "")))
            elif attachment.get("type") == "skill_listing":
                for name, chars in listing_entries(attachment.get("content") or ""):
                    if repo.listed_file(name):
                        texts.append((index, "listing", repo.listed_file(name), chars))
            elif attachment.get("type") == "agent_listing_delta":
                for line in attachment.get("addedLines") or []:
                    for name, chars in listing_entries(line):
                        plugin, _, agent = name.partition(":")
                        if plugin in repo.plugins and agent:
                            texts.append((index, "listing", f"plugins/{plugin}/agents/{agent}.md", chars))
            elif attachment.get("type") == "invoked_skills":
                for skill in attachment.get("skills") or []:
                    file = repo.skill_file(skill.get("content") or "")
                    if file:
                        texts.append((index, "skill-reinjected", file, len(skill.get("content") or "")))
        elif kind == "user":
            for block in blocks(record):
                if block.get("type") == "text":
                    file = repo.skill_file(block_text(block))
                    if file:
                        texts.append((index, "skill-body", file, len(block_text(block))))
                        loads.append((index, file))
                elif block.get("type") == "tool_result" and block.get("tool_use_id") in read_calls:
                    texts.append((index, "read", read_calls.pop(block["tool_use_id"]), len(block_text(block))))
    def carried(at):
        """The API calls after record `at` that sent it: up to the next compaction."""
        end = next((c for c in compactions if c > at), index + 1)
        return bisect.bisect_left(calls, end) - bisect.bisect_right(calls, at)

    return {
        "texts": [(channel, file, chars, carried(at)) for at, channel, file, chars in texts],
        "reads": reads,
        "loads": loads,
        "edits": edits,
        "calls": len(calls),
        "roots": roots,
    }


def context_report(session_files, repo, usages, since_days):
    """The context.json of a run, and for each session the files of this repository it loaded."""
    files = defaultdict(lambda: {"chars": 0, "char_reads": 0, "sessions": set(),
                                 "channels": defaultdict(lambda: {"loads": 0, "chars": 0, "char_reads": 0})})
    readers = defaultdict(lambda: defaultdict(lambda: {"contexts": 0, "edited_after": 0}))
    reach = defaultdict(lambda: {"runs": 0, "read": defaultdict(int)})
    rereads = defaultdict(lambda: {"contexts": 0, "repeated": 0})
    loaded_by_session = {}
    contexts = api_calls = 0

    for session_file in session_files:
        session = context_of(session_file, repo, ())
        transcripts = [(None, session)] + [
            (agent_type(path) or "subagent", context_of(path, repo, session["roots"])) for path in subagent_files(session_file)
        ]
        loaded = set()
        for role, context in transcripts:
            contexts += 1
            api_calls += context["calls"]
            for channel, file, chars, carried in context["texts"]:
                entry, used = files[file], files[file]["channels"][channel]
                entry["chars"] += chars
                entry["char_reads"] += chars * carried
                entry["sessions"].add(session_file.stem)
                used["loads"] += 1
                used["chars"] += chars
                used["char_reads"] += chars * carried
                if channel != "listing":
                    loaded.add(file)
            first_read = {}
            for at, file, *_ in context["reads"]:
                first_read.setdefault(file, at)
            for file, at in first_read.items():
                reader = readers[file]["session" if role is None else role]
                reader["contexts"] += 1
                reader["edited_after"] += any(edit > at for edit in context["edits"])
            repeats = defaultdict(int)
            for _, *read in context["reads"]:
                repeats[tuple(read)] += 1
            for file in first_read:
                rereads[file]["contexts"] += 1
            for (file, *_), times in repeats.items():
                rereads[file]["repeated"] += times - 1
            for at, skill in context["loads"]:
                plugin_dir = skill.split("/skills/")[0] + "/"
                run = reach[skill]
                run["runs"] += 1
                for file in {file for read_at, file, *_ in context["reads"] if read_at > at and file.startswith(plugin_dir) and file != skill}:
                    run["read"][file] += 1
        loaded_by_session[session_file.stem] = sorted(loaded)

    trouble = defaultdict(lambda: defaultdict(lambda: {"turns": 0, "failed": 0, "rejected": 0}))
    for usage in usages:
        for skill, use in usage.items():
            for label, counts in use["by_version"].items():
                for count, value in counts.items():
                    trouble[skill][label][count] += value

    report = {
        "since_days": since_days,
        "unit": "characters",
        "contexts": contexts,
        "api_calls": api_calls,
        "files": [
            {"file": file, "chars": entry["chars"], "char_reads": entry["char_reads"], "sessions": len(entry["sessions"]),
             "channels": {channel: dict(used) for channel, used in entry["channels"].items()}}
            for file, entry in sorted(files.items(), key=lambda item: -item[1]["char_reads"])
        ],
        "readers": {file: {role: dict(counts) for role, counts in sorted(roles.items())} for file, roles in sorted(readers.items())},
        "reach": {skill: {"runs": run["runs"], "read": dict(sorted(run["read"].items()))} for skill, run in sorted(reach.items())},
        "rereads": {file: dict(counts) for file, counts in sorted(rereads.items()) if counts["repeated"]},
        "trouble": {skill: {label: dict(counts) for label, counts in sorted(labels.items())} for skill, labels in sorted(trouble.items())},
    }
    return report, loaded_by_session


def context_table(report):
    def share(part, whole):
        return f"{part} of {whole} ({100 * part // whole}%)" if whole else "0"

    lines = [
        "# Context cost",
        "",
        f"What the files of this repository put into the context of the {report['contexts']} contexts of the last "
        f"{report['since_days']:g} days, subagents included, over {report['api_calls']} API calls. All sizes are in characters. "
        "A char-read is one character sent in one API call: a text counts once for each call after it, up to the next compaction.",
        "",
        "Not counted: what Bash commands print, agent system prompts, and the prompts a workflow gives its agents.",
        "",
        f"## The {CONTEXT_TOP} files with the most char-reads",
        "",
        "| File | Char-reads | Chars loaded | Sessions | " + " | ".join(CHANNELS) + " |",
        "|---|---|---|---|" + "---|" * len(CHANNELS),
    ]
    for entry in report["files"][:CONTEXT_TOP]:
        by_channel = [str(entry["channels"].get(channel, {}).get("char_reads", 0)) for channel in CHANNELS]
        lines.append(f"| `{entry['file']}` | {entry['char_reads']} | {entry['chars']} | {entry['sessions']} | " + " | ".join(by_channel) + " |")

    lines += ["", "## Readers", "", "Each context that read the file with the Read tool, by who read it, and how many of them edited a file of this repository after that read.", "",
              "| File | Reader | Edited after |", "|---|---|---|"]
    for file, roles in report["readers"].items():
        for role, counts in roles.items():
            lines.append(f"| `{file}` | {role} | {share(counts['edited_after'], counts['contexts'])} |")

    lines += ["", "## Reference reach", "", "Each skill load, and the files of the same plugin read with the Read tool after it in the same context. A file printed with a Bash command does not count, so a share is a lower bound.", "",
              "| Skill | Loads | File read after the load |", "|---|---|---|"]
    for skill, run in report["reach"].items():
        reached = ", ".join(f"`{file}` {share(times, run['runs'])}" for file, times in run["read"].items()) or "none"
        lines.append(f"| `{skill}` | {run['runs']} | {reached} |")

    lines += ["", "## Re-reads", "", "A Read of the same part of a file that the context had read already.", "",
              "| File | Contexts that read it | Repeated reads |", "|---|---|---|"]
    for file, counts in report["rereads"].items():
        lines.append(f"| `{file}` | {counts['contexts']} | {counts['repeated']} |")

    lines += ["", "## Trouble per skill version", "",
              "The tool calls of a skill's turns that failed, and those the user rejected, as the pick counts them.", "",
              "| Skill | Version | Turns | Failed | Rejected |", "|---|---|---|---|---|"]
    for skill, labels in report["trouble"].items():
        for label, counts in labels.items():
            lines.append(f"| `{skill}` | {label} | {counts['turns']} | {counts['failed']} | {counts['rejected']} |")
    return "\n".join(lines) + "\n"


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def copy_transcripts(session_file, transcripts_dir):
    """Copy a session and its subagent transcripts, in the layout Claude Code keeps them in."""
    copy = transcripts_dir / session_file.name
    transcripts_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(session_file, copy)
    subagents = session_file.with_suffix("") / "subagents"
    if subagents.is_dir():
        shutil.copytree(subagents, copy.with_suffix("") / "subagents")
    return copy


def mirror(host):
    """Bring the mirror of the host's ~/.claude/projects up to date over ssh, and return it."""
    if not HOST_RE.fullmatch(host):
        sys.exit(f"error: {host!r} is no ssh host name: use letters, digits and . _ @ -, and start with a letter, a digit or _")
    target = MIRROR_DIR / host / "projects"
    target.mkdir(parents=True, exist_ok=True)
    # Claude Code links a forked subagent's transcript by its absolute path on the host:
    # --copy-unsafe-links copies the file, where -a alone copies a link into this machine.
    argv = ["rsync", "-a", "--copy-unsafe-links", "--delete", "-e", "ssh -o BatchMode=yes", f"{host}:.claude/projects/", f"{target}/"]
    try:
        done = subprocess.run(argv, capture_output=True, text=True)
    except FileNotFoundError:
        sys.exit("error: rsync is not on PATH; the pick of another host needs it here and on the host")
    if done.returncode not in (0, RSYNC_VANISHED):
        sys.exit(f"error: {shlex.join(argv)} exited {done.returncode}:\n{done.stderr.strip()}")
    return target


def latest_copies(summaries):
    """One summary for each session id: Claude Code can keep a session in two project folders."""
    latest = {}
    for session, usage in summaries:
        kept = latest.get(session["session_id"])
        if kept:
            print(f"warning: session {session['session_id']} is in {kept[0]['session']} and {session['session']}; the pick reads the one that ended last", file=sys.stderr)
        if not kept or session["ended"] > kept[0]["ended"]:
            latest[session["session_id"]] = (session, usage)
    return list(latest.values())


def pick(args):
    plugins_dir = Path(args.plugins_dir)
    host = socket.gethostname() if args.host is None else args.host
    projects_dir = Path(args.projects_dir) if args.host is None else mirror(args.host)
    plugins = {p.name for p in plugins_dir.iterdir() if p.is_dir()}
    reviewed_until = {}
    for path in args.review_dir.glob("runs/*/sessions/*.json"):
        ended = json.loads(path.read_text(encoding="utf-8"))["ended"]
        reviewed_until[path.stem] = max(reviewed_until.get(path.stem, ""), ended)
    cutoff = time.time() - args.since_days * 86400
    recent = [
        f
        for f in sorted(projects_dir.glob("*/*.jsonl"))
        if f.stat().st_mtime >= cutoff
    ]
    summaries = latest_copies([(session, usage) for session, usage in (summarize(f, plugins) for f in recent) if session["skills"]])
    # A session that went on after its review is picked again, and reviewed whole.
    unreviewed = [
        session
        for session, _ in summaries
        if session["session_id"] not in reviewed_until or session["ended"] > reviewed_until[session["session_id"]]
    ]
    large = [
        {"session_id": s["session_id"], "largest_file_mb": s["largest_file_mb"], "refused": s["largest_file_mb"] >= REFUSED_TRANSCRIPT_MB}
        for s in unreviewed
        if s["largest_file_mb"] >= LARGE_TRANSCRIPT_MB
    ]
    for session in large:
        verdict = "not picked: GitHub refuses a file above 100 MB" if session["refused"] else "large"
        print(f"warning: session {session['session_id']} holds a {session['largest_file_mb']} MB file, {verdict}", file=sys.stderr)
    candidates = [s for s in unreviewed if s["largest_file_mb"] < REFUSED_TRANSCRIPT_MB]

    picked = []
    for bucket in RANKED_BUCKETS:
        unpicked = [s for s in candidates if s[bucket] and "bucket" not in s]
        for session in sorted(unpicked, key=lambda s: -s[bucket])[: args.per_bucket]:
            session["bucket"] = bucket
            picked.append(session)
    last = last_release(plugins_dir)
    release = None
    if last:
        for session in candidates:
            plugins_run = sorted({skill.split(":")[0] for skill in released_skills(session, last)})
            files = [path for plugin in plugins_run for path in last["changed"].get(plugin, [])]
            if files:
                session["changed_files"] = files
        unpicked = [s for s in candidates if "changed_files" in s and "bucket" not in s]
        random.Random(args.seed).shuffle(unpicked)

        def runs_no_changed_skill(session):
            folders = [f"/{skill.replace(':', '/skills/')}/" for skill in released_skills(session, last)]
            return not any(folder in path for folder in folders for path in session["changed_files"])

        for session in sorted(unpicked, key=runs_no_changed_skill)[: args.per_bucket]:
            session["bucket"] = "changed"
            picked.append(session)
        release = {
            "version": last["version"],
            "previous": last["previous"],
            "plugins": sorted(last["changed"]),
            "candidates": sum("changed_files" in s for s in candidates),
        }
    unpicked = [s for s in candidates if "bucket" not in s]
    for session in random.Random(args.seed).sample(unpicked, min(args.per_bucket, len(unpicked))):
        session["bucket"] = "random"
        picked.append(session)

    # Every session of the window, plugin use or none: the listing reaches each of them.
    newest = {}
    for f in recent:
        if f.stem not in newest or f.stat().st_mtime > newest[f.stem].stat().st_mtime:
            newest[f.stem] = f
    context, loaded_by_session = context_report(
        newest.values(), Repository(plugins_dir), [usage for _, usage in summaries], args.since_days
    )
    for session in picked:
        session["context_files"] = loaded_by_session.get(session["session_id"], [])

    marketplace = json.loads((plugins_dir.parent / ".claude-plugin" / "marketplace.json").read_text(encoding="utf-8"))
    version = marketplace["metadata"]["version"]
    now = datetime.now().astimezone()
    run_dir = args.review_dir / "runs" / f"{now:%Y-%m-%dT%H%M%S}-{host}-v{version}"
    run_dir.mkdir(parents=True)
    for session in picked:
        session["transcript"] = str(copy_transcripts(Path(session["session"]), run_dir / "transcripts"))

    commit = subprocess.run(["git", "-C", str(REPO_ROOT), "rev-parse", "HEAD"], capture_output=True, text=True)
    picks = {
        "run_dir": str(run_dir),
        "candidates": len(candidates),
        "already_reviewed": len(summaries) - len(unreviewed),
        "large_transcripts": large,
        "release": release,
        "sessions": picked,
    }
    write_json(run_dir / "run.json", {
        "started": now.isoformat(timespec="seconds"),
        "host": host,
        "marketplace_version": version,
        "picker_commit": commit.stdout.strip(),
        "since_days": args.since_days,
        "per_bucket": args.per_bucket,
        "seed": args.seed,
        "candidates": picks["candidates"],
        "already_reviewed": picks["already_reviewed"],
        "large_transcripts": large,
        "release": release,
    })
    write_json(run_dir / "picks.json", picks)
    (run_dir / "usage.md").write_text(usage_table([usage for _, usage in summaries], plugins_dir, args.since_days), encoding="utf-8")
    write_json(run_dir / "context.json", context)
    (run_dir / "context.md").write_text(context_table(context), encoding="utf-8")

    json.dump(picks, sys.stdout, indent=2, ensure_ascii=False)
    print()


def record(args):
    run_dir = Path(args.run_dir)
    picks = {s["session_id"]: s for s in json.loads((run_dir / "picks.json").read_text(encoding="utf-8"))["sessions"]}
    reviews = json.loads(Path(args.result).read_text(encoding="utf-8"))
    unknown = [r["session_id"] for r in reviews if r["session_id"] not in picks]
    if unknown:
        sys.exit(f"error: not a session of {run_dir / 'picks.json'}: {', '.join(unknown)}")

    survived, judged = [], []
    for review in reviews:
        # A review that did not finish leaves the session for a later run to pick again.
        if review.get("findings") is None:
            continue
        session = picks[review["session_id"]]
        context = review.get("context") or []
        write_json(run_dir / "sessions" / f"{session['session_id']}.json", {**session, "findings": review["findings"], "context": context})
        survived += [
            {"session_id": session["session_id"], "bucket": session["bucket"], **finding}
            for finding in review["findings"]
            if not finding.get("refuted")
        ]
        judged += [{"session_id": session["session_id"], **judgment} for judgment in context if not judgment.get("refuted")]
    write_json(run_dir / "findings.json", survived)
    write_json(run_dir / "context-judgments.json", judged)
    reviewed = len(list(run_dir.glob("sessions/*.json")))
    print(f"{reviewed} of {len(picks)} sessions recorded, {len(survived)} findings and {len(judged)} context judgments survived: {run_dir}")


def context_trend(args):
    runs = sorted(path.parent for path in args.review_dir.glob("runs/*/context.json"))
    if not runs:
        sys.exit(f"error: no run in {args.review_dir / 'runs'} holds a context.json: a pick writes one")
    # Characters per API call: a run compares with another of a longer window or a busier week.
    per_call = []
    for run in runs:
        report = json.loads((run / "context.json").read_text(encoding="utf-8"))
        calls = report["api_calls"] or 1
        per_call.append({entry["file"]: entry["char_reads"] // calls for entry in report["files"]})
    files = sorted(per_call[-1], key=lambda file: -per_call[-1][file])[: args.top]
    print("# Context cost over the runs\n")
    print("Characters that each file put into an average API call, per run. A blank cell is a run in which the file put nothing into context.\n")
    print("| File | " + " | ".join(run.name for run in runs) + " |")
    print("|---|" + "---|" * len(runs))
    for file in files:
        print(f"| `{file}` | " + " | ".join(str(run.get(file, "")) for run in per_call) + " |")


def render(args):
    def emit(label, text):
        text = text.strip()
        if len(text) > args.max_chars:
            text = f"{text[: args.max_chars]} [... {len(text) - args.max_chars} more chars]"
        if text:
            print(f"{label}: {text}\n")

    for record in records(args.transcript):
        if record.get("type") == "assistant":
            skill = record.get("attributionSkill")
            speaker = f"ASSISTANT [{skill}]" if skill else "ASSISTANT"
            for block in blocks(record):
                if block.get("type") == "text":
                    emit(speaker, block_text(block))
                elif block.get("type") == "tool_use":
                    emit(f"{speaker} TOOL {block.get('name')}", json.dumps(block.get("input"), ensure_ascii=False))
        elif record.get("type") == "user":
            for block in blocks(record):
                if block.get("type") == "text":
                    emit("USER", block_text(block))
                elif block.get("type") == "tool_result":
                    emit("ERROR" if block.get("is_error") else "RESULT", block_text(block))
        elif record.get("type") == "attachment":
            # A prompt the user typed while the agent worked: no user record holds it.
            attachment = record.get("attachment") or {}
            if attachment.get("type") == "queued_command" and (attachment.get("origin") or {}).get("kind") == "human":
                emit("USER (queued)", block_text({"content": attachment.get("prompt")}))


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    commands = parser.add_subparsers(dest="command", required=True)

    pick_parser = commands.add_parser("pick", help="start a run: pick the sessions, copy their transcripts, print the picks as JSON")
    pick_parser.add_argument("--review-dir", type=Path, default=os.environ.get("SESSION_REVIEW_DIR") or None, help="the review store (default: $SESSION_REVIEW_DIR)")
    source = pick_parser.add_mutually_exclusive_group()
    source.add_argument("--projects-dir", default=os.path.expanduser("~/.claude/projects"))
    source.add_argument("--host", help=f"an ssh host: pick its sessions from a mirror of its ~/.claude/projects in {MIRROR_DIR}/<host>, and name the run for it")
    pick_parser.add_argument("--plugins-dir", default=REPO_ROOT / "plugins")
    pick_parser.add_argument("--since-days", type=float, default=7, help="only sessions modified in the last N days (default: 7)")
    pick_parser.add_argument("--per-bucket", type=int, default=2, help="sessions to pick from each bucket (default: 2)")
    pick_parser.add_argument("--seed", type=int, help="seed of the random draws, in the changed and the random bucket, for a repeatable pick")
    pick_parser.set_defaults(run=pick)

    render_parser = commands.add_parser("render", help="print one transcript as text")
    render_parser.add_argument("transcript", help="a session .jsonl, or one of its subagent transcripts")
    render_parser.add_argument("--max-chars", type=int, default=600, help="characters kept per message or tool result (default: 600)")
    render_parser.set_defaults(run=render)

    record_parser = commands.add_parser("record", help="write the findings of a review into its run folder")
    record_parser.add_argument("run_dir", help="the run_dir that pick printed")
    record_parser.add_argument("result", help="a JSON file: [{session_id, findings: [{..., refuted}] or null, context: [{..., refuted}]}]")
    record_parser.set_defaults(run=record)

    context_parser = commands.add_parser("context", help="print the context cost of each file over the runs of the review store")
    context_parser.add_argument("--review-dir", type=Path, default=os.environ.get("SESSION_REVIEW_DIR") or None, help="the review store (default: $SESSION_REVIEW_DIR)")
    context_parser.add_argument("--top", type=int, default=CONTEXT_TOP, help=f"files to show, the costliest of the last run first (default: {CONTEXT_TOP})")
    context_parser.set_defaults(run=context_trend)

    args = parser.parse_args()
    if args.command in ("pick", "context") and not (args.review_dir and args.review_dir.is_dir()):
        parser.error("no review store: set SESSION_REVIEW_DIR to a checkout of the private session-data repository (docs/MONITORING.md)")
    args.run(args)


if __name__ == "__main__":
    main()
