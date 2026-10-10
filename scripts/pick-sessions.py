#!/usr/bin/env python3
"""Pick local Claude Code sessions worth a review, and render one as plain text.

pick    prints the sessions that used a plugin of this marketplace, a few from each
        bucket: most user pushback, most tool errors, most output tokens, and random.
render  prints one transcript as text an agent can read in parts.
"""

import argparse
import json
import os
import random
import re
import sys
import time
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

# Results with is_error set where no tool failed: Claude Code refused a command it
# could not prove stays in the worktree, or skipped the siblings of an interrupted batch.
ISOLATION_REFUSAL = "this session is isolated in the worktree"
CANCELLED_SIBLING = "Cancelled: parallel tool call"

INTERRUPT = "[Request interrupted by user"

# A cached install carries the plugin version in the skill-load banner; a dev checkout has none.
BANNER_RE = re.compile(
    r"Base directory for this skill:\s*\S*?/([A-Za-z0-9_.-]+)/(\d+\.\d+\.\d+)/skills/"
)

RANKED_BUCKETS = ("pushback", "errors", "output_tokens")


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


def summarize(session_file, plugins):
    subagents = subagent_files(session_file)
    skills, versions, counted_messages = set(), set(), set()
    pushback = errors = output_tokens = 0
    started = None

    for path in [session_file, *subagents]:
        for record in records(path):
            started = started or record.get("timestamp")
            if record.get("type") == "assistant":
                if record.get("attributionPlugin") in plugins and record.get("attributionSkill"):
                    skills.add(record["attributionSkill"])
                # One API message spans several records, each repeating its usage.
                message = record.get("message") or {}
                if message.get("id") not in counted_messages:
                    counted_messages.add(message.get("id"))
                    output_tokens += (message.get("usage") or {}).get("output_tokens", 0)
            elif record.get("type") == "user":
                denial = record.get("toolDenialKind")
                for block in blocks(record):
                    text = block_text(block)
                    if block.get("type") == "text":
                        pushback += text.startswith(INTERRUPT)
                        banner = BANNER_RE.search(text)
                        if banner and banner[1] in plugins:
                            versions.add(banner[2])
                    elif block.get("type") == "tool_result" and block.get("is_error"):
                        if denial == "user-rejected":
                            pushback += 1
                        elif not (
                            denial
                            or ISOLATION_REFUSAL in text.lower()
                            or text.startswith(CANCELLED_SIBLING)
                        ):
                            errors += 1

    return {
        "session": str(session_file),
        "project": session_file.parent.name,
        "started": started,
        "skills": sorted(skills),
        "versions": sorted(versions),
        "subagents": len(subagents),
        "pushback": pushback,
        "errors": errors,
        "output_tokens": output_tokens,
    }


def pick(args):
    plugins = {p.name for p in Path(args.plugins_dir).iterdir() if p.is_dir()}
    cutoff = time.time() - args.since_days * 86400
    recent = (
        f
        for f in sorted(Path(args.projects_dir).glob("*/*.jsonl"))
        if f.stat().st_mtime >= cutoff
    )
    candidates = [s for s in (summarize(f, plugins) for f in recent) if s["skills"]]

    picked = []
    for bucket in RANKED_BUCKETS:
        unpicked = [s for s in candidates if s[bucket] and "bucket" not in s]
        for session in sorted(unpicked, key=lambda s: -s[bucket])[: args.per_bucket]:
            session["bucket"] = bucket
            picked.append(session)
    unpicked = [s for s in candidates if "bucket" not in s]
    for session in random.Random(args.seed).sample(unpicked, min(args.per_bucket, len(unpicked))):
        session["bucket"] = "random"
        picked.append(session)

    json.dump({"candidates": len(candidates), "sessions": picked}, sys.stdout, indent=2)
    print()


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
                    emit(f"{speaker} TOOL {block.get('name')}", json.dumps(block.get("input")))
        elif record.get("type") == "user":
            for block in blocks(record):
                if block.get("type") == "text":
                    emit("USER", block_text(block))
                elif block.get("type") == "tool_result":
                    emit("ERROR" if block.get("is_error") else "RESULT", block_text(block))


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    commands = parser.add_subparsers(dest="command", required=True)

    pick_parser = commands.add_parser("pick", help="print the picked sessions as JSON")
    pick_parser.add_argument("--projects-dir", default=os.path.expanduser("~/.claude/projects"))
    pick_parser.add_argument("--plugins-dir", default=REPO_ROOT / "plugins")
    pick_parser.add_argument("--since-days", type=float, default=7, help="only sessions modified in the last N days (default: 7)")
    pick_parser.add_argument("--per-bucket", type=int, default=2, help="sessions to pick from each bucket (default: 2)")
    pick_parser.add_argument("--seed", type=int, help="seed of the random bucket, for a repeatable pick")
    pick_parser.set_defaults(run=pick)

    render_parser = commands.add_parser("render", help="print one transcript as text")
    render_parser.add_argument("transcript", help="a session .jsonl, or one of its subagent transcripts")
    render_parser.add_argument("--max-chars", type=int, default=600, help="characters kept per message or tool result (default: 600)")
    render_parser.set_defaults(run=render)

    args = parser.parse_args()
    args.run(args)


if __name__ == "__main__":
    main()
