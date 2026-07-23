---
name: are-you-sure
description: "Re-check finished work against what was asked before you test it."
user-invocable: true
disable-model-invocation: true
---

Before the user tests: prove the work is actually done.

1. Re-read the original ask. List every requirement it contains, including implied ones (tests updated, docs touched, edge cases handled).
2. List every claim of "done" made in the work above.
3. Re-verify each claim against fresh evidence — re-run the command, re-read the diff, re-open the file. Memory of having done it is not evidence.

Done when every requirement maps to a verified claim and every gap is named. "It should work" is not a verdict — for each item the answer is either "verified: here is the evidence" or "not verified: here is what I still need to check."
