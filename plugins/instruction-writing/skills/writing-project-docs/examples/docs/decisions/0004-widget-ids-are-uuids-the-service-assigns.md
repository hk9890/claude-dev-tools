# 0004: Widget IDs are UUIDs the service assigns

Each replica creates widgets without asking the others, so an ID needs no shared counter, and it
never changes once a widget exists.

Replaces 0002: the client-supplied SKU was the key, and two warehouses used the same SKU for
different widgets.
Rejected: a database sequence, because it shows the widget count in public URLs.
