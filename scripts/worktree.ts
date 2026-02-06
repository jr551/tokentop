#!/usr/bin/env bun
/**
 * Git worktree management CLI
 * Manages parallel development branches using git worktrees
 */

import { parseArgs } from 'util';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { WORKTREE_DIR, STATE_FILE } from './worktree/config.ts';

// Command handlers (stubs - to be implemented)
const commands: Record<string, (args: string[]) => Promise<void>> = {
  create: async (args) => {
    console.log('create command stub:', args);
  },
  list: async (args) => {
    console.log('list command stub:', args);
  },
  remove: async (args) => {
    console.log('remove command stub:', args);
  },
  status: async (args) => {
    console.log('status command stub:', args);
  },
  switch: async (args) => {
    console.log('switch command stub:', args);
  },
  cleanup: async (args) => {
    console.log('cleanup command stub:', args);
  },
};

function printHelp() {
  console.log(`
tokentop worktree - Git worktree management

Usage:
  bun scripts/worktree.ts <command> [options]
  bun run worktree <command> [options]

Commands:
  create <branch>         Create a new worktree for a branch
  list                    List all active worktrees
  remove <branch>         Remove a worktree
  status                  Show worktree status
  switch <branch>         Switch to a worktree
  cleanup                 Clean up stale worktrees

Options:
  -h, --help              Show this help message
  -v, --version           Show version

Examples:
  bun run worktree create feature/new-ui
  bun run worktree list
  bun run worktree remove feature/new-ui
  bun run worktree switch feature/new-ui
  bun run worktree cleanup
`);
}

function printVersion() {
  console.log('tokentop worktree v0.1.0');
}

async function main() {
  const args = process.argv.slice(2);

  // Handle no arguments
  if (args.length === 0) {
    printHelp();
    process.exit(0);
  }

  // Handle global flags
  if (args[0] === '-h' || args[0] === '--help') {
    printHelp();
    process.exit(0);
  }

  if (args[0] === '-v' || args[0] === '--version') {
    printVersion();
    process.exit(0);
  }

  const command = args[0];

  // Validate command exists
  if (!commands[command]) {
    console.error(`Error: Unknown command '${command}'`);
    console.error('Run with --help for usage information');
    process.exit(1);
  }

  // Ensure .worktrees directory exists for state file
  const stateDir = join(process.cwd(), '.worktrees');
  if (!existsSync(stateDir)) {
    mkdirSync(stateDir, { recursive: true });
  }

  // Execute command with remaining arguments
  try {
    await commands[command](args.slice(1));
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();
