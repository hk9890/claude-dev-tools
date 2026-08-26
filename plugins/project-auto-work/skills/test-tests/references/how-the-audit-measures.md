# How the audit measures what it reports

Three probes stand behind the findings the report names. Each one turns a claim the audit
would otherwise take on trust into something it measured for itself.

## Reachability is measured, not read

A mutant has two outcomes and only one of them explains itself. A **killed** mutant proves
two things at once: a test executes that line, and it asserts something the mutation breaks.
A **surviving** mutant proves neither — the line may be code no test runs, or the edit may
change nothing observable.

So the audit measures the difference rather than reading it out of a coverage report. For
each survivor, and only for a survivor, it puts the most lethal one-line edit the language
allows at the same site — a throw carrying the marker `TT-REACH` — and runs the slice once
more:

| The throw | What it proves | How the report reads it |
|---|---|---|
| a test fails | the line executes | a blind spot: the tests run this code and pin none of the behavior the mutation changed |
| the slice stays green, and a control throw on a line the tests do reach turns it red | no test executes the line | untested code — the fix is a new test, never a stronger one |
| it will not compile, or the control throw stays green too | nothing | `inconclusive`, and it stays in the pessimistic half of the score |

The marker is a convenience, not the signal. Plenty of harnesses never echo it — a browser
runner with no `pageerror` handler, anything that swallows a subprocess's stderr — so a red
selector is what counts. The **control probe** is what makes a *green* selector mean
something: without it, "no test reaches this line" and "this harness cannot surface a throw
at all" look identical, and they are opposite findings.

A killed mutant costs no probe: the kill already proved its line runs. The extra runs
therefore scale with the number of survivors — which is to say, with how weak the suite
turns out to be.

`kill_rate` is then a rate over sites the tests demonstrably reach. Sites proven unreached
leave the ratio and become findings of their own kind, because "write a test" and "fix a
blind test" are opposite repairs. Inconclusive sites stay in the denominator: the audit
could not prove them absent, and the pessimistic reading is the honest one.

A throw needs no instrumentation, no coverage tooling and no install, and it behaves the
same in any language. That is what keeps the audit portable now that nothing is read on
trust.

## The coverage report is an optional input

Where the repository documents a command that emits a coverage summary as JSON on stdout,
conforming to [`coverage-summary-schema.md`](coverage-summary-schema.md)
(a `files` array of repo-relative path + covered/uncovered line ranges), the workflow runs
it, validates it with `scripts/validate-coverage-summary.py`, and spends it on two things:
ranking candidate mutation sites, so more of the run lands on code the tests already reach,
and `untested_churn`. It is never a filter — a line the report calls uncovered is still a
legal target, and the throw probe settles the question either way.

No such command is a normal outcome, not a fault. The audit loses the ranking hint and the
coverage-truth probe, says so in `not_checked`, and runs to a full report. It never parses
coverage formats: all format-specific work stays in the repository.

Where a command does exist it is the one input the audit would otherwise take on trust, so
from `medium` up it gets probed: a few mutants land on lines the summary calls *uncovered*,
chosen where the summary is most likely wrong — code driven by subprocess or real-service
tests, uncovered ranges inside otherwise-covered functions. A mutant killed there proves the
command under-reports.

## The unit/integration split comes from the repository too

A unit test needs no database, socket, or other external process. So the audit runs the
unit slice once with that environment denied, and each test that fails only because the
environment is gone is an integration test wearing a unit-test label — CI time spent under
a name that promises speed.

Which tests are unit tests is the repository's own claim: the baseline discovers the
declaration from the same sources as the test command, then greps the production code for
the environment variables it actually reads that name a host, URL, port, DSN or credential.
The denial recipe is built from that list and nothing else. Environment is the whole
mechanism, and that is what makes the probe portable — any OS, no privileges, nothing
installed.

The probe reports **not run**, with the reason, in two cases: the repo declares no split,
or its production code reads no such variable and there is therefore nothing to take away.
The second matters more than it looks. A repo that reaches the outside world through
hardcoded hosts or in-process fakes would pass a denied run while nothing was denied, and
an empty failure list would read as proven isolation — so it lands in `not_checked`
instead. Both cases also raise an `auditability` finding, and neither is guessed at from
file names.
