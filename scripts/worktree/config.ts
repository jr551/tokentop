/**
 * Worktree configuration constants
 */

import { join } from 'path';

export const WORKTREE_DIR = join(process.cwd(), '..', '.tokentop-worktrees');
export const STATE_FILE = join(process.cwd(), '.worktrees', 'state.json');
export const REPO_ROOT = process.cwd();

export interface WorktreeState {
  version: 1;
  worktrees: WorktreeEntry[];
  lastUpdated: string;
}

export interface WorktreeEntry {
  branch: string;
  path: string;
  createdAt: string;
  lastAccessed: string;
  active: boolean;
}
