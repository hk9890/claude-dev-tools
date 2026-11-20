# 0001: All plugins ship under one version and one repo tag

A release is one bump, one tag and one set of notes for every plugin. Skills name skills of other
plugins as `<plugin>:<skill>`, and `mise run check-consistency` checks them only inside one commit.

Rejected: a version and a `<name>--vX.Y.Z` tag series per plugin, because each release then needs a
bump, a tag and notes for each changed plugin.
Rejected: a version constraint on a `dependencies` entry, because no per-plugin tag exists to
resolve it: Claude Code installs the current copy and disables the dependent plugin on a range miss.
