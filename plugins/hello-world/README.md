# Hello World Plugin

A simple example plugin for Claude Code that demonstrates how to create custom slash commands.

## Overview

This plugin provides a basic "Hello World" example to help you understand the structure and components of a Claude Code plugin.

## Features

- `/greet` - A friendly greeting command that explains what plugins can do

## Installation

### From This Marketplace

If you have this marketplace added to your Claude Code installation:

```bash
/plugin install hello-world
```

### From Local Directory

```bash
/plugin install /home/hans/dev/projects/claude-dev-tools/plugins/hello-world
```

## Usage

After installation, simply run:

```bash
/greet
```

This will display a friendly greeting message and information about Claude Code plugins.

## Plugin Structure

```
hello-world/
├── .claude-plugin/
│   └── plugin.json       # Plugin manifest with metadata
├── commands/
│   └── greet.md          # Slash command definition
└── README.md             # This file
```

## Creating Your Own Plugin

To create your own plugin based on this example:

1. Copy the plugin directory structure
2. Update `.claude-plugin/plugin.json` with your plugin details
3. Create command files in the `commands/` directory
4. Each `.md` file in `commands/` becomes a slash command
5. Use frontmatter to add descriptions:
   ```markdown
   ---
   description: Your command description
   ---
   ```

## Components You Can Add

Claude Code plugins support:

- **Commands**: Custom slash commands (like `/greet`)
- **Agents**: Specialized AI agents for specific tasks
- **MCP Servers**: Integration with external tools
- **Hooks**: Custom behaviors triggered by events

## Learn More

- [Claude Code Plugin Documentation](https://docs.claude.com/en/docs/claude-code/plugins)
- [Plugin Marketplaces](https://docs.claude.com/en/docs/claude-code/plugin-marketplaces)

## License

MIT
