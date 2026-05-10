# Beads Setup Troubleshooting

Use this after beads should already exist, but the CLI, project state, or setup health is broken.

## `bd` command not found

```bash
npm bin -g
export PATH="$(npm bin -g):$PATH"
npm install -g beads
bd --version
```

Root cause is usually global npm bin not on `PATH`.

## Permission errors installing beads

```bash
mkdir -p ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc
npm install -g beads
```

Fallback (less preferred):

```bash
sudo npm install -g beads
```

## `bd init` fails in non-git repo

```bash
git init
git add .
git commit -m "Initial commit"
bd init --skip-agents
bd hooks install
```

## Hooks missing after init

```bash
bd hooks install
ls -la .git/hooks/pre-commit
ls -la .git/hooks/post-merge
```

## Quick setup verification

```bash
bd --version
ls -la .beads/
bd doctor
bd status
```

If setup still fails, continue with [beads-runtime-troubleshooting.md](beads-runtime-troubleshooting.md).
