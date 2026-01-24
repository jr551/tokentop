import { Database } from 'bun:sqlite';
import * as fs from 'fs/promises';
import { PATHS } from './paths.ts';
import { applyMigrations } from './migrations/index.ts';

let db: Database | null = null;
let currentAppRunId: number | null = null;

export async function initDatabase(): Promise<Database> {
  if (db) return db;

  await fs.mkdir(PATHS.data.dir, { recursive: true });

  db = new Database(PATHS.data.database, { create: true });

  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA synchronous = NORMAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 2000');

  applyMigrations(db);

  const stmt = db.prepare(`
    INSERT INTO app_runs (started_at, app_version, pid, hostname)
    VALUES (?, ?, ?, ?)
  `);

  const result = stmt.run(
    Date.now(),
    process.env.npm_package_version ?? '0.0.0',
    process.pid,
    require('os').hostname()
  );

  currentAppRunId = Number(result.lastInsertRowid);

  return db;
}

export function getDatabase(): Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

export function getAppRunId(): number | null {
  return currentAppRunId;
}

export function closeDatabase(): void {
  if (db && currentAppRunId) {
    db.prepare('UPDATE app_runs SET ended_at = ? WHERE id = ?').run(Date.now(), currentAppRunId);
  }
  if (db) {
    db.close();
    db = null;
    currentAppRunId = null;
  }
}

export function isDatabaseInitialized(): boolean {
  return db !== null;
}
