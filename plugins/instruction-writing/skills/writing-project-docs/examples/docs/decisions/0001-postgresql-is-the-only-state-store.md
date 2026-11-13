# 0001: PostgreSQL is the only state store

A stock move changes a widget and its warehouse counts in one transaction, and the service scales
by adding replicas that share nothing. A second store breaks both.

Rejected: a Redis read cache, because widget reads stay under 5 ms at peak and a cache needs an
invalidation path that a failed transaction can skip.
