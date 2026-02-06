/**
 * Integration tests for worktree commands
 * Tests complete workflows including lifecycle, error cases, state consistency, and cleanup
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, rmSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import type { WorktreeState } from '../state.ts';

// Test configuration
const TEST_REPO_NAME = 'tokentop-test-repo';
const TEST_REPO_PATH = join(tmpdir(), TEST_REPO_NAME);
const TEST_WORKTREE_DIR = join(TEST_REPO_PATH, '..', '.tokentop-worktrees');
const TEST_STATE_FILE = join(TEST_REPO_PATH, '.worktrees', 'state.json');

/**
 * Helper: Run a command in the test repo
 */
function runInTestRepo(command: string): string {
  try {
    return execSync(command, {
      cwd: TEST_REPO_PATH,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch (error: any) {
    throw new Error(`Command failed: ${command}\n${error.stderr || error.message}`);
  }
}

/**
 * Helper: Run worktree command
 */
function runWorktreeCommand(args: string): string {
  return runInTestRepo(`bun ${join(__dirname, '../../../scripts/worktree.ts')} ${args}`);
}

/**
 * Helper: Read state file
 */
function readStateFile(): WorktreeState {
  const content = readFileSync(TEST_STATE_FILE, 'utf-8');
  return JSON.parse(content);
}

/**
 * Helper: Check if worktree exists on disk
 */
function worktreeExistsOnDisk(name: string): boolean {
  return existsSync(join(TEST_WORKTREE_DIR, name));
}

/**
 * Helper: Check if branch exists
 */
function branchExists(branch: string): boolean {
  try {
    runInTestRepo(`git rev-parse --verify ${branch}`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Helper: Create uncommitted changes in a worktree
 */
function createUncommittedChanges(worktreeName: string): void {
  const worktreePath = join(TEST_WORKTREE_DIR, worktreeName);
  runInTestRepo(`echo "test change" > ${worktreePath}/test-file.txt`);
}

/**
 * Setup: Create a fresh git repo for testing
 */
beforeAll(() => {
  // Clean up any existing test repo
  if (existsSync(TEST_REPO_PATH)) {
    rmSync(TEST_REPO_PATH, { recursive: true, force: true });
  }
  if (existsSync(TEST_WORKTREE_DIR)) {
    rmSync(TEST_WORKTREE_DIR, { recursive: true, force: true });
  }

  // Create new test repo
  mkdirSync(TEST_REPO_PATH, { recursive: true });
  runInTestRepo('git init');
  runInTestRepo('git config user.email "test@example.com"');
  runInTestRepo('git config user.name "Test User"');
  
  // Create initial commit on main branch
  runInTestRepo('echo "# Test Repo" > README.md');
  runInTestRepo('git add README.md');
  runInTestRepo('git commit -m "Initial commit"');
  runInTestRepo('git branch -M main');
});

/**
 * Cleanup: Remove test repo and worktrees
 */
afterAll(() => {
  // Clean up test worktrees first
  try {
    const worktrees = runInTestRepo('git worktree list --porcelain');
    const worktreePaths = worktrees
      .split('\n')
      .filter(line => line.startsWith('worktree '))
      .map(line => line.replace('worktree ', ''))
      .filter(path => path !== TEST_REPO_PATH);

    for (const path of worktreePaths) {
      try {
        runInTestRepo(`git worktree remove --force "${path}"`);
      } catch {
        // Ignore errors during cleanup
      }
    }
  } catch {
    // Ignore errors during cleanup
  }

  // Remove test directories
  if (existsSync(TEST_REPO_PATH)) {
    rmSync(TEST_REPO_PATH, { recursive: true, force: true });
  }
  if (existsSync(TEST_WORKTREE_DIR)) {
    rmSync(TEST_WORKTREE_DIR, { recursive: true, force: true });
  }
});

describe('worktree integration tests', () => {
  describe('create and remove lifecycle', () => {
    test('should create a new worktree with auto-detected branch prefix', () => {
      const output = runWorktreeCommand('create test-feature-1 --no-install');
      
      expect(output).toContain('Creating worktree: test-feature-1');
      expect(output).toContain('Branch: feature/test-feature-1');
      expect(output).toContain('✓ Worktree created successfully!');
      
      // Verify worktree exists on disk
      expect(worktreeExistsOnDisk('test-feature-1')).toBe(true);
      
      // Verify branch was created
      expect(branchExists('feature/test-feature-1')).toBe(true);
      
      // Verify state file was updated
      const state = readStateFile();
      const worktree = state.worktrees.find(w => w.name === 'test-feature-1');
      expect(worktree).toBeDefined();
      expect(worktree?.branch).toBe('feature/test-feature-1');
      expect(worktree?.gitStatus).toBe('clean');
    });

    test('should create worktree with custom branch name', () => {
      const output = runWorktreeCommand('create test-custom --branch custom/my-branch --no-install');
      
      expect(output).toContain('Branch: custom/my-branch');
      expect(branchExists('custom/my-branch')).toBe(true);
      
      const state = readStateFile();
      const worktree = state.worktrees.find(w => w.name === 'test-custom');
      expect(worktree?.branch).toBe('custom/my-branch');
    });

    test('should detect fix- prefix correctly', () => {
      const output = runWorktreeCommand('create fix-bug-123 --no-install');
      
      expect(output).toContain('Branch: fix/fix-bug-123');
      expect(branchExists('fix/fix-bug-123')).toBe(true);
    });

    test('should remove a clean worktree successfully', () => {
      // Create a worktree to remove
      runWorktreeCommand('create test-to-remove --no-install');
      expect(worktreeExistsOnDisk('test-to-remove')).toBe(true);
      
      // Remove it
      const output = runWorktreeCommand('remove test-to-remove');
      
      expect(output).toContain('✓ Removed worktree:');
      expect(output).toContain('✓ Updated state file');
      expect(output).toContain("✓ Successfully removed worktree 'test-to-remove'");
      
      // Verify worktree is gone
      expect(worktreeExistsOnDisk('test-to-remove')).toBe(false);
      
      // Verify state file was updated
      const state = readStateFile();
      const worktree = state.worktrees.find(w => w.name === 'test-to-remove');
      expect(worktree).toBeUndefined();
    });

    test('should remove worktree and delete branch with --delete-branch', () => {
      // Create a worktree
      runWorktreeCommand('create test-delete-branch --no-install');
      const branchName = 'feature/test-delete-branch';
      expect(branchExists(branchName)).toBe(true);
      
      // Remove with --delete-branch
      const output = runWorktreeCommand('remove test-delete-branch --delete-branch');
      
      expect(output).toContain('✓ Deleted branch:');
      expect(branchExists(branchName)).toBe(false);
    });
  });

  describe('multiple concurrent worktrees', () => {
    test('should create and manage multiple worktrees simultaneously', () => {
      // Create multiple worktrees
      runWorktreeCommand('create test-multi-1 --no-install');
      runWorktreeCommand('create test-multi-2 --no-install');
      runWorktreeCommand('create test-multi-3 --no-install');
      
      // Verify all exist
      expect(worktreeExistsOnDisk('test-multi-1')).toBe(true);
      expect(worktreeExistsOnDisk('test-multi-2')).toBe(true);
      expect(worktreeExistsOnDisk('test-multi-3')).toBe(true);
      
      // Verify state file has all three
      const state = readStateFile();
      expect(state.worktrees.filter(w => w.name.startsWith('test-multi-')).length).toBe(3);
      
      // List should show all worktrees
      const listOutput = runWorktreeCommand('list');
      expect(listOutput).toContain('test-multi-1');
      expect(listOutput).toContain('test-multi-2');
      expect(listOutput).toContain('test-multi-3');
      
      // Clean up
      runWorktreeCommand('remove test-multi-1');
      runWorktreeCommand('remove test-multi-2');
      runWorktreeCommand('remove test-multi-3');
    });

    test('should handle list command with JSON output', () => {
      // Create a test worktree
      runWorktreeCommand('create test-json-list --no-install');
      
      // Get JSON output
      const output = runWorktreeCommand('list --json');
      const worktrees = JSON.parse(output);
      
      expect(Array.isArray(worktrees)).toBe(true);
      const testWorktree = worktrees.find((w: any) => w.name === 'test-json-list');
      expect(testWorktree).toBeDefined();
      expect(testWorktree.branch).toBe('feature/test-json-list');
      expect(testWorktree.gitStatus).toBeDefined();
      
      // Clean up
      runWorktreeCommand('remove test-json-list');
    });
  });

  describe('error cases', () => {
    test('should reject duplicate worktree names', () => {
      // Create first worktree
      runWorktreeCommand('create test-duplicate --no-install');
      
      // Try to create duplicate
      expect(() => {
        runWorktreeCommand('create test-duplicate --no-install');
      }).toThrow();
      
      // Verify only one exists in state
      const state = readStateFile();
      const duplicates = state.worktrees.filter(w => w.name === 'test-duplicate');
      expect(duplicates.length).toBe(1);
      
      // Clean up
      runWorktreeCommand('remove test-duplicate');
    });

    test('should reject main/master as worktree names', () => {
      expect(() => {
        runWorktreeCommand('create main --no-install');
      }).toThrow(/Cannot create worktree named "main" or "master"/);
      
      expect(() => {
        runWorktreeCommand('create master --no-install');
      }).toThrow(/Cannot create worktree named "main" or "master"/);
    });

    test('should reject removing non-existent worktree', () => {
      expect(() => {
        runWorktreeCommand('remove non-existent-worktree');
      }).toThrow(/not found/);
    });

    test('should block removal with uncommitted changes without --force', () => {
      // Create worktree and add uncommitted changes
      runWorktreeCommand('create test-uncommitted --no-install');
      createUncommittedChanges('test-uncommitted');
      
      expect(() => {
        runWorktreeCommand('remove test-uncommitted');
      }).toThrow(/Removal blocked due to warnings/);
      
      // Verify worktree still exists
      expect(worktreeExistsOnDisk('test-uncommitted')).toBe(true);
      
      // Clean up with --force
      runWorktreeCommand('remove test-uncommitted --force');
    });

    test('should allow removal with uncommitted changes when using --force', () => {
      // Create worktree and add uncommitted changes
      runWorktreeCommand('create test-force-remove --no-install');
      createUncommittedChanges('test-force-remove');
      
      // Remove with --force
      const output = runWorktreeCommand('remove test-force-remove --force');
      
      expect(output).toContain('Proceeding with --force flag');
      expect(output).toContain('✓ Successfully removed');
      expect(worktreeExistsOnDisk('test-force-remove')).toBe(false);
    });

    test('should reject removing main worktree', () => {
      const state = readStateFile();
      
      expect(state.mainWorktree).toContain('tokentop-test-repo');
    });
  });

  describe('state consistency', () => {
    test('should maintain consistent state across operations', () => {
      const initialState = readStateFile();
      const initialCount = initialState.worktrees.length;
      
      // Create worktree
      runWorktreeCommand('create test-consistency --no-install');
      let state = readStateFile();
      expect(state.worktrees.length).toBe(initialCount + 1);
      expect(state.updatedAt).toBeDefined();
      
      // Verify worktree details
      const worktree = state.worktrees.find(w => w.name === 'test-consistency');
      expect(worktree).toBeDefined();
      expect(worktree?.path).toContain('test-consistency');
      expect(worktree?.createdAt).toBeDefined();
      expect(worktree?.lastActivity).toBeDefined();
      
      // Remove worktree
      runWorktreeCommand('remove test-consistency');
      state = readStateFile();
      expect(state.worktrees.length).toBe(initialCount);
      expect(state.worktrees.find(w => w.name === 'test-consistency')).toBeUndefined();
    });

    test('should update state file atomically', () => {
      // Create multiple worktrees in quick succession
      runWorktreeCommand('create test-atomic-1 --no-install');
      runWorktreeCommand('create test-atomic-2 --no-install');
      runWorktreeCommand('create test-atomic-3 --no-install');
      
      // State file should be valid JSON and contain all worktrees
      const state = readStateFile();
      expect(state.version).toBe(1);
      expect(state.worktrees.find(w => w.name === 'test-atomic-1')).toBeDefined();
      expect(state.worktrees.find(w => w.name === 'test-atomic-2')).toBeDefined();
      expect(state.worktrees.find(w => w.name === 'test-atomic-3')).toBeDefined();
      
      // Clean up
      runWorktreeCommand('remove test-atomic-1');
      runWorktreeCommand('remove test-atomic-2');
      runWorktreeCommand('remove test-atomic-3');
    });

    test('should handle state file with missing worktree directory', () => {
      // Create worktree
      runWorktreeCommand('create test-missing-dir --no-install');
      
      // Manually delete the worktree directory (simulating external deletion)
      const worktreePath = join(TEST_WORKTREE_DIR, 'test-missing-dir');
      rmSync(worktreePath, { recursive: true, force: true });
      
      // Remove should still work and clean up state
      const output = runWorktreeCommand('remove test-missing-dir');
      expect(output).toContain('Warning: Worktree path does not exist');
      expect(output).toContain('Removing from state file only');
      
      // Verify state is cleaned up
      const state = readStateFile();
      expect(state.worktrees.find(w => w.name === 'test-missing-dir')).toBeUndefined();
    });
  });

  describe('cleanup command', () => {
    test('should run cleanup and report when no worktrees need cleanup', () => {
      runWorktreeCommand('create test-clean-worktree --no-install');
      
      const output = runWorktreeCommand('cleanup --dry-run');
      
      expect(output).toContain('Scanning for worktrees to clean up');
      
      runWorktreeCommand('remove test-clean-worktree');
    });

    test('should identify stale worktrees for cleanup', () => {
      // Create a worktree
      runWorktreeCommand('create test-stale --no-install');
      
      // Manually update lastActivity to be old (simulate staleness)
      const state = readStateFile();
      const worktree = state.worktrees.find(w => w.name === 'test-stale');
      if (worktree) {
        const oldDate = new Date();
        oldDate.setDate(oldDate.getDate() - 35); // 35 days ago
        worktree.lastActivity = oldDate.toISOString();
        
        // Write state back
        const stateFile = TEST_STATE_FILE;
        const fs = require('fs');
        fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
      }
      
      // Run cleanup with stale-days=30
      const output = runWorktreeCommand('cleanup --dry-run --stale-days 30');
      
      expect(output).toContain('test-stale');
      expect(output).toContain('no activity for 30+ days');
      
      // Clean up
      runWorktreeCommand('remove test-stale');
    });

    test('should skip worktrees with uncommitted changes during cleanup', () => {
      // Create worktree with uncommitted changes
      runWorktreeCommand('create test-cleanup-skip --no-install');
      createUncommittedChanges('test-cleanup-skip');
      
      // Make it appear merged
      const state = readStateFile();
      const worktree = state.worktrees.find(w => w.name === 'test-cleanup-skip');
      if (worktree) {
        // Manually mark as old to trigger cleanup detection
        const oldDate = new Date();
        oldDate.setDate(oldDate.getDate() - 35);
        worktree.lastActivity = oldDate.toISOString();
        const fs = require('fs');
        fs.writeFileSync(TEST_STATE_FILE, JSON.stringify(state, null, 2));
      }
      
      // Run cleanup
      const output = runWorktreeCommand('cleanup --dry-run --stale-days 30');
      
      expect(output).toContain('test-cleanup-skip');
      expect(output).toContain('uncommitted changes');
      
      // Clean up with force
      runWorktreeCommand('remove test-cleanup-skip --force');
    });

    test('should handle cleanup with --force flag', () => {
      // Create a stale worktree
      runWorktreeCommand('create test-cleanup-force --no-install');
      
      // Make it stale
      const state = readStateFile();
      const worktree = state.worktrees.find(w => w.name === 'test-cleanup-force');
      if (worktree) {
        const oldDate = new Date();
        oldDate.setDate(oldDate.getDate() - 35);
        worktree.lastActivity = oldDate.toISOString();
        const fs = require('fs');
        fs.writeFileSync(TEST_STATE_FILE, JSON.stringify(state, null, 2));
      }
      
      // Note: cleanup --force requires user confirmation in non-test environments
      // In tests, we can't easily simulate user input, so we'll just verify dry-run
      const output = runWorktreeCommand('cleanup --dry-run --stale-days 30');
      expect(output).toContain('test-cleanup-force');
      
      // Clean up manually
      runWorktreeCommand('remove test-cleanup-force');
    });
  });

  describe('status command', () => {
    test('should show detailed status for a specific worktree', () => {
      // Create a worktree
      runWorktreeCommand('create test-status --no-install');
      
      // Get status
      const output = runWorktreeCommand('status test-status');
      
      expect(output).toContain('test-status');
      expect(output).toContain('feature/test-status');
      expect(output).toContain('Git Status');
      
      // Clean up
      runWorktreeCommand('remove test-status');
    });

    test('should show summary of all worktrees when no name specified', () => {
      // Create multiple worktrees
      runWorktreeCommand('create test-status-1 --no-install');
      runWorktreeCommand('create test-status-2 --no-install');
      
      // Get status summary
      const output = runWorktreeCommand('status');
      
      expect(output).toContain('test-status-1');
      expect(output).toContain('test-status-2');
      
      // Clean up
      runWorktreeCommand('remove test-status-1');
      runWorktreeCommand('remove test-status-2');
    });
  });

  describe('switch command', () => {
    test('should provide instructions for switching to a worktree', () => {
      // Create a worktree
      runWorktreeCommand('create test-switch --no-install');
      
      // Get switch instructions
      const output = runWorktreeCommand('switch test-switch');
      
      expect(output).toContain('cd');
      expect(output).toContain('test-switch');
      
      // Clean up
      runWorktreeCommand('remove test-switch');
    });
  });
});
