# Another forge

Run each `gh` step of `SKILL.md` with the forge CLI the project documents; with none documented, at the first field of step 1 that CLI cannot read, or at a later `gh` step it cannot run, stop and ask the user. Pass both reviews the local branch that step 1 puts at the PR's head (`git rev-parse --abbrev-ref HEAD`) in place of `<pr-number>`: they read a number as a GitHub PR, and the PR's head branch can have another name in this checkout.
