"""Whether a directory is the private layout of the checkout around it.

The standard's private layout keeps AGENTS.md and docs/ in a folder the user names, inside
a checkout the user cannot commit to. The checkout's CLAUDE.local.md imports that folder's
AGENTS.md, and the import, not the folder's name, marks the folder as private.
"""

import os

LOCAL_FILE = "CLAUDE.local.md"


def imports_of(root):
    """The path of each @-line in the parent's CLAUDE.local.md that imports root/AGENTS.md,
    as written: absolute, home-relative, or relative to the parent."""
    root = os.path.abspath(root)
    parent = os.path.dirname(root)
    try:
        with open(os.path.join(parent, LOCAL_FILE), encoding="utf-8", errors="replace") as fh:
            text = fh.read()
    except OSError:
        return []
    target = os.path.realpath(os.path.join(root, "AGENTS.md"))
    found = []
    for line in text.splitlines():
        line = line.strip()
        if line.startswith("@"):
            path = line[1:]
            if os.path.realpath(os.path.join(parent, os.path.expanduser(path))) == target:
                found.append(path)
    return found


def is_private(root):
    return bool(imports_of(root))


def is_absolute(path):
    """An import a git worktree's copy of CLAUDE.local.md still resolves to the checkout."""
    return os.path.isabs(os.path.expanduser(path))
