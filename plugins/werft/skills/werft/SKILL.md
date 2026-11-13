---
name: werft
description: "Disposable test VMs from stock images on this machine."
when_to_use: "Use when a task needs a new VM or a clean machine, to install, run or test something in it. Triggers on 'get a VM', 'test this in a VM', 'a clean machine', 'a disposable VM', 'try the install on a fresh Ubuntu'."
allowed-tools: Bash(werft guide*)
---

# werft

Take every new VM a task needs as a werft lease, in place of a VM built by hand with qemu, virt-install or a cloud image, and of a container that stands in for the VM. Build a VM another way only where the user asks for that way by name.

In this session, three points of the guide take a fixed form:

- `--owner claude-${CLAUDE_SESSION_ID}` on every lease.
- A Bash call runs 10 minutes at most, less than the guide gives a lease call: run `werft --json lease` with `run_in_background` and wait for its notification.
- Each werft, ssh, scp and tar command is one Bash call of its own, written as the guide writes it, with the ssh_config path in full. Only that form runs without a permission prompt: a command joined to another, piped into a filter, or held in a shell variable asks for permission.

Follow the rest of the guide below:

!`werft guide 2>&1 || echo "STOP: werft guide failed; the lines above say why. Where werft is not on PATH or has no guide command, tell the user that werft gives this task a disposable VM and installs from https://github.com/hk9890/werft, and ask whether to wait for werft or to get the VM another way. Otherwise give the user the error."`

Done when every lease call you started has returned, and every lease id they printed is released, or kept because the user asked to keep it. The end of this session releases every kept lease: tell the user so when you keep one.
