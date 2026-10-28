# The browser form

The relay and the saved report happen first and in full, so the form adds a surface and
takes nothing away — a missing plugin, an absent Node, or a closed tab leaves the user
exactly where the review would have left them.

Before the form opens or the questions go to chat, say plainly that the settled batch is
not among the questions, and where they stop any of it: the form's free-text box, or a
reply in chat. A settled item is one the user never saw a question about, so an item filed
wrongly is one they never hear of at all — naming the batch is what keeps that recoverable.

Where `html-visualize-ask` appears in your own available skills, call the Skill tool with
`html-visualization:html-visualize-ask`, even where it loaded earlier in this session,
passing the open items in the argument of the command in decision-split.md. Invoking it
in this turn is what keeps the report in context when the answers come back, so the picks
read as the reply the user would otherwise have typed.

`html-visualize-ask` ships in the separate `html-visualization` plugin, which is not a
dependency of this one, and is missing from your available skills for either of two
reasons: the plugin is not installed, or it is installed at a version whose ask mode is
user-only and so unreachable by the `Skill` tool. Say which of those you can tell. Unless
you can tell the plugin is not installed, print the command of decision-split.md, which
the user may type. Then put the same questions in chat. Never reconstruct the form by
other means — a user-only skill is reserved for the user typing its name.
