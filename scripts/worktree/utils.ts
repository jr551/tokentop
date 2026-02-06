/**
 * Git worktree utility functions
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { STATE_FILE, type WorktreeState, type WorktreeEntry } from './config.ts';

export function runGit(command: string): string {
  try {
    return execSync(`git ${command}`, { encoding: 'utf-8' }).trim();
  } catch (error) {
    throw new Error(`Git command failed: ${command}`);
  }
}

export function loadState(): WorktreeState {
  if (!existsSync(STATE_FILE)) {
    return {
      version: 1,
      worktrees: [],
      lastUpdated: new Date().toISOString(),
    };
  }

  try {
    const content = readFileSync(STATE_FILE, 'utf-8');
    return JSON.parse(content);
  } catch {
    return {
      version: 1,
      worktrees: [],
      lastUpdated: new Date().toISOString(),
    };
  }
}

export function saveState(state: WorktreeState): void {
  state.lastUpdated = new Date().toISOString();
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

export function findWorktree(branch: string, state: WorktreeState): WorktreeEntry | undefined {
  return state.worktrees.find((w) => w.branch === branch);
}

export function addWorktree(entry: WorktreeEntry, state: WorktreeState): void {
  const existing = findWorktree(entry.branch, state);
  if (existing) {
    Object.assign(existing, entry);
  } else {
    state.worktrees.push(entry);
  }
}

export function removeWorktree(branch: string, state: WorktreeState): boolean {
  const index = state.worktrees.findIndex((w) => w.branch === branch);
  if (index !== -1) {
    state.worktrees.splice(index, 1);
    return true;
  }
  return false;
}
