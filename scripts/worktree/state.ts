/**
 * Worktree state management module
 * Handles reading/writing the .worktrees/state.json file with atomic writes
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { STATE_FILE } from './config.ts';

/**
 * Information about a single worktree
 */
export interface WorktreeInfo {
  name: string;
  path: string;
  branch: string;
  createdAt: string;
  lastActivity: string;
  gitStatus: 'clean' | 'dirty' | 'unknown';
  description?: string;
}

/**
 * Root state object for all worktrees
 */
export interface WorktreeState {
  version: 1;
  mainWorktree: string;
  worktrees: WorktreeInfo[];
  updatedAt: string;
}

function createDefaultState(): WorktreeState {
  return {
    version: 1,
    mainWorktree: process.cwd(),
    worktrees: [],
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Read the worktree state from disk
 * Creates default state file if it doesn't exist
 */
export async function readState(): Promise<WorktreeState> {
  try {
    const content = await fs.readFile(STATE_FILE, 'utf-8');
    return JSON.parse(content) as WorktreeState;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      const defaultState = createDefaultState();
      await writeState(defaultState);
      return defaultState;
    }
    throw error;
  }
}

/**
 * Write state to disk atomically (write to temp, then rename)
 */
export async function writeState(state: WorktreeState): Promise<void> {
  await fs.mkdir(path.dirname(STATE_FILE), { recursive: true });

  const tempFile = STATE_FILE + '.tmp';
  await fs.writeFile(tempFile, JSON.stringify(state, null, 2), 'utf-8');

  await fs.rename(tempFile, STATE_FILE);
}

/**
 * Add or update a worktree in the state
 */
export async function updateWorktree(info: WorktreeInfo): Promise<void> {
  const state = await readState();

  const existingIndex = state.worktrees.findIndex(w => w.name === info.name);

  if (existingIndex >= 0) {
    state.worktrees[existingIndex] = info;
  } else {
    state.worktrees.push(info);
  }

  state.updatedAt = new Date().toISOString();
  await writeState(state);
}

/**
 * Remove a worktree from the state by name
 */
export async function removeWorktree(name: string): Promise<void> {
  const state = await readState();

  state.worktrees = state.worktrees.filter(w => w.name !== name);
  state.updatedAt = new Date().toISOString();

  await writeState(state);
}
