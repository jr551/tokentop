# Tokentop (`ttop`) - AI Token Usage Monitor

**Tokentop** is a terminal-based real-time token usage and cost monitoring application.

## Quick Start

To install dependencies:

```bash
bun install
```

To start a development server:

```bash
bun dev
```

To run for production:

```bash
bun start
```

## Git Worktree Workflow

Tokentop supports a parallel development workflow using Git worktrees. This allows you to work on multiple branches simultaneously without switching contexts in your main directory.

```bash
bun run worktree create feature/my-new-feature
bun run worktree list
```

See [AGENTS.md](./AGENTS.md#git-worktree-workflow) for detailed documentation.

---

This project was created using `bun init` in bun v1.3.6. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
