---
name: werft
description: "Disposable test VMs: lease one from a stock image on this machine, use it, release it."
when_to_use: "Use when a task needs a VM or a clean machine, to install, run or test something in it. Triggers on 'get a VM', 'test this in a VM', 'a clean machine', 'a disposable VM', 'try the install on a fresh Ubuntu'. Not for the user's build VMs."
allowed-tools: Bash(werft guide*), Bash(werft help*), Bash(werft --json images), Bash(werft --json lease *), Bash(werft --json leases), Bash(werft --json extend *), Bash(werft --json release *), Bash(werft release *), Bash(werft --json reap)
---

# werft

Take every VM a task needs as a werft lease, in place of a VM built by hand with qemu, virt-install or a cloud image, and of a container that stands in for the VM. Build a VM another way only where the user asks for that way by name.

This session sets two things the guide leaves open:

- `--owner claude-${CLAUDE_SESSION_ID}` on every lease.
- The Bash tool stops a call at 10 minutes, less than the guide gives a lease: run `werft --json lease` with `run_in_background` and wait for its notification.

Follow all of the guide below:

!`werft guide 2>&1 || echo "STOP: werft guide failed; the lines above say why. Where werft is not on PATH or has no guide command, tell the user that werft gives this task a disposable VM and installs from https://github.com/hk9890/werft, and ask whether to wait for werft or to get the VM another way. Otherwise give the user the error."`

Done when `werft --json leases` lists no lease whose owner is `claude-${CLAUDE_SESSION_ID}`, also after a failure.
