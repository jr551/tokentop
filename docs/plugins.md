# Plugins

tokentop's plugin system lets you add new providers, coding agents, themes, and notification channels.

## Quick Start

```bash
# Load a local plugin for one session
ttop --plugin ./my-plugin

# Or install a community plugin
bun add tokentop-provider-replicate
```

Then add it to your config so it loads every time:

```jsonc
// ~/.config/tokentop/config.json
{
  "plugins": {
    "npm": ["tokentop-provider-replicate"]
  }
}
```

## Plugin Types

| Type | Purpose |
|------|---------|
| **Provider** | Fetch usage data from an AI model provider |
| **Agent** | Parse coding agent sessions for token tracking |
| **Theme** | Color scheme for the TUI |
| **Notification** | Alert delivery (Slack, Discord, terminal bell, etc.) |

## Naming Convention

### Official plugins (`@tokentop/*`)

Maintained by the tokentop team or trusted contributors. Published under the `@tokentop` npm org.

| Type | npm name |
|------|----------|
| Provider | `@tokentop/provider-anthropic` |
| Agent | `@tokentop/agent-opencode` |
| Theme | `@tokentop/theme-dracula` |
| Notification | `@tokentop/notification-slack` |

### Community plugins (`tokentop-*`)

Published by anyone — no npm org membership needed. Use the `tokentop-{type}-` prefix:

| Type | npm name |
|------|----------|
| Provider | `tokentop-provider-replicate` |
| Agent | `tokentop-agent-windsurf` |
| Theme | `tokentop-theme-catppuccin` |
| Notification | `tokentop-notification-ntfy` |

Scoped community plugins also work: `@yourname/tokentop-provider-foo`

## Loading Plugins

Plugins load from three sources, in order:

1. **Builtins** -- shipped with tokentop
2. **Local plugins** -- from the plugins directory, config paths, and CLI flags
3. **npm plugins** -- installed packages listed in config

### CLI Flag (`--plugin`)

Load a plugin for a single run. Repeatable.

```bash
ttop --plugin ~/dev/my-provider
ttop --plugin ./theme-catppuccin --plugin ./provider-foo
```

Paths can be:
- A directory with a `package.json`, `src/index.ts`, or `index.ts`
- A single `.ts` or `.js` file

### Config File

Persistent plugin configuration lives in `~/.config/tokentop/config.json`:

```jsonc
{
  "plugins": {
    // Local paths -- loaded every run
    "local": [
      "~/development/my-provider",
      "../relative/to/config/dir"
    ],

    // npm packages -- must be installed in node_modules
    "npm": [
      "tokentop-provider-replicate",
      "tokentop-theme-catppuccin"
    ],

    // Disable specific plugins by ID (including builtins)
    "disabled": [
      "perplexity",
      "visual-flash"
    ]
  }
}
```

**Path resolution:**
- `~/` expands to your home directory
- Relative paths resolve from the config directory (`~/.config/tokentop/`)
- Absolute paths work as-is

### Plugins Directory

Drop plugins into `~/.config/tokentop/plugins/` and they're auto-discovered:

```
~/.config/tokentop/plugins/
├── my-theme.ts              # Single-file plugin
├── provider-foo/            # Directory plugin
│   ├── package.json
│   └── src/index.ts
└── quick-notification.js    # Single-file plugin
```

For directories, the loader checks for entry points in this order:
1. `package.json` `main` or `exports["."]` field
2. `src/index.ts`
3. `index.ts`
4. `dist/index.js`

### Disabling Plugins

Any plugin (including builtins) can be disabled by adding its ID to `plugins.disabled`:

```jsonc
{
  "plugins": {
    "disabled": ["perplexity", "minimax", "terminal-bell"]
  }
}
```

## Permission Sandbox

All plugins declare what they need access to:

```typescript
permissions: {
  network: { enabled: true, allowedDomains: ['api.example.com'] },
  filesystem: { read: true, paths: ['~/.config/my-tool/'] },
  env: { read: true, vars: ['MY_API_KEY'] },
}
```

Core enforces these at runtime. A plugin cannot make network requests to domains it didn't declare, read env vars it didn't list, or access filesystem paths outside its allowlist.

## Building a Plugin

### Setup

```bash
mkdir tokentop-theme-monokai
cd tokentop-theme-monokai
bun init
bun add @tokentop/plugin-sdk
```

### Minimal Theme Plugin

Themes are the simplest plugin type -- pure data, no async logic:

```typescript
// src/index.ts
import { createThemePlugin } from '@tokentop/plugin-sdk';

export default createThemePlugin({
  id: 'monokai',
  type: 'theme',
  version: '1.0.0',
  meta: {
    name: 'Monokai',
    description: 'Classic Monokai color scheme',
  },
  permissions: {},
  theme: {
    colorScheme: 'dark',
    colors: {
      bg: '#272822',
      fg: '#f8f8f2',
      border: '#75715e',
      borderFocused: '#a6e22e',
      primary: '#a6e22e',
      secondary: '#66d9ef',
      accent: '#f92672',
      muted: '#75715e',
      success: '#a6e22e',
      warning: '#e6db74',
      error: '#f92672',
      info: '#66d9ef',
      headerBg: '#1e1f1c',
      headerFg: '#f8f8f2',
      statusBarBg: '#1e1f1c',
      statusBarFg: '#75715e',
      tableBg: '#272822',
      tableHeaderBg: '#3e3d32',
      tableHeaderFg: '#a6e22e',
      tableRowBg: '#272822',
      tableRowAltBg: '#2d2e27',
      tableRowFg: '#f8f8f2',
      tableSelectedBg: '#49483e',
      tableSelectedFg: '#f8f8f2',
    },
  },
});
```

### Test It

```bash
ttop --plugin ./tokentop-theme-monokai
```

### Publish It

Use the `tokentop-{type}-` prefix for community plugins:

```json
{
  "name": "tokentop-theme-monokai",
  "main": "src/index.ts",
  "peerDependencies": {
    "@tokentop/plugin-sdk": "^0.1.0"
  }
}
```

```bash
npm publish
```

## SDK Reference

For the full API -- provider plugins, credential discovery, testing harness, lifecycle hooks -- see the [Plugin SDK documentation](https://github.com/tokentopapp/plugin-sdk).

Install: `bun add @tokentop/plugin-sdk`
