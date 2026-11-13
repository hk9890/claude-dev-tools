---
name: werft
description: "werft: disposable test VMs from stock images on this machine."
when_to_use: "Use when a task needs a VM or a clean machine, to install, run or test something in it. Triggers on 'get a VM', 'test this in a VM', 'a clean machine', 'a disposable VM', 'try the install on a fresh Ubuntu'. Not for the user's build VMs, which werft keeps apart from leases."
allowed-tools: Bash(werft version), Bash(werft guide), Bash(werft help*), Bash(werft --json images), Bash(werft --json lease *), Bash(werft --json leases), Bash(werft --json extend *), Bash(werft --json release *), Bash(werft --json reap)
---

# werft

werft hands out disposable VMs on this host. A lease is a VM on a thin overlay of a stock image: it answers SSH in about a minute, nothing done in it reaches the stock image or the host, and release destroys it. Take every VM a task needs as a werft lease, also where qemu, virt-install, a cloud image or a container could serve. Build a VM another way only where the user asks for that way by name.

The guide below is the output of `werft guide`, the instructions of the installed werft. Follow all of it, from the first lease to the last release:

!`werft guide 2>/dev/null || echo "STOP: werft guide failed, so werft is not on PATH or is too old to have the guide. Tell the user that werft gives this task a disposable VM, and that it installs from https://github.com/hk9890/werft. Ask whether to wait for werft or to get the VM another way."`
