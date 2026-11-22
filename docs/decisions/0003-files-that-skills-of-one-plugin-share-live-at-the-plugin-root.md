# 0003: Files that skills of one plugin share live at the plugin root

Claude Code loads a listing entry for each skill the model can start, and for each workflow in a
plugin-root `workflows/` folder, into every session that has the plugin. A file under plugin-root
`references/` or `bin/` costs no context until an agent reads or runs it.

Rejected: a skill that only holds shared files, because a Skill tool load needs that entry.
Rejected: plugin-root `workflows/` for a workflow that a skill starts by file path, because nothing
starts it by its listed name, so its entry does no work.
