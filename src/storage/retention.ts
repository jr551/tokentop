/**
 * Data retention policy — prevents unbounded database growth.
 *
 * Detailed snapshot data (agent_session_snapshots, agent_session_stream_snapshots,
 * provider_snapshots) is pruned after a retention window. Aggregated data in
 * usage_events, hourly_aggregates, and daily_aggregates is kept longer since
 * those tables grow much more slowly.
 */

import { getDatabase, isDatabaseInitialized } from "./db.ts";

/** Keep detailed snapshots for 7 days */
const SNAPSHOT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

/** Keep provider snapshots for 7 days */
const PROVIDER_SNAPSHOT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

/** Keep usage events for 90 days */
const USAGE_EVENT_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

/** Maximum rows to delete in a single batch (prevents long-running transactions) */
const PRUNE_BATCH_SIZE = 10_000;

export interface PruneResult {
  agentSessionSnapshots: number;
  providerSnapshots: number;
  usageEvents: number;
  durationMs: number;
}

/**
 * Prune old data from the database. Deletes in batches to avoid
 * holding a write lock for too long.
 */
export function pruneOldData(nowMs: number = Date.now()): PruneResult {
  if (!isDatabaseInitialized()) {
    return { agentSessionSnapshots: 0, providerSnapshots: 0, usageEvents: 0, durationMs: 0 };
  }

  const db = getDatabase();
  const start = performance.now();

  let agentSessionSnapshots = 0;
  let providerSnapshots = 0;
  let usageEvents = 0;

  const snapshotCutoff = nowMs - SNAPSHOT_RETENTION_MS;
  const providerCutoff = nowMs - PROVIDER_SNAPSHOT_RETENTION_MS;
  const usageEventCutoff = nowMs - USAGE_EVENT_RETENTION_MS;

  // Prune agent_session_snapshots in batches.
  // CASCADE delete handles agent_session_stream_snapshots automatically.
  {
    const stmt = db.prepare(`
      DELETE FROM agent_session_snapshots
      WHERE id IN (
        SELECT id FROM agent_session_snapshots
        WHERE timestamp < ?
        LIMIT ?
      )
    `);

    let deleted: number;
    do {
      const result = stmt.run(snapshotCutoff, PRUNE_BATCH_SIZE);
      deleted = result.changes;
      agentSessionSnapshots += deleted;
    } while (deleted === PRUNE_BATCH_SIZE);
  }

  // Prune old provider_snapshots in batches
  {
    const stmt = db.prepare(`
      DELETE FROM provider_snapshots
      WHERE id IN (
        SELECT id FROM provider_snapshots
        WHERE timestamp < ?
        LIMIT ?
      )
    `);

    let deleted: number;
    do {
      const result = stmt.run(providerCutoff, PRUNE_BATCH_SIZE);
      deleted = result.changes;
      providerSnapshots += deleted;
    } while (deleted === PRUNE_BATCH_SIZE);
  }

  // Prune old usage_events in batches
  {
    const stmt = db.prepare(`
      DELETE FROM usage_events
      WHERE id IN (
        SELECT id FROM usage_events
        WHERE timestamp < ?
        LIMIT ?
      )
    `);

    let deleted: number;
    do {
      const result = stmt.run(usageEventCutoff, PRUNE_BATCH_SIZE);
      deleted = result.changes;
      usageEvents += deleted;
    } while (deleted === PRUNE_BATCH_SIZE);
  }

  const durationMs = Math.round(performance.now() - start);

  return { agentSessionSnapshots, providerSnapshots, usageEvents, durationMs };
}

/**
 * Run incremental auto_vacuum if supported (WAL mode).
 * This reclaims free pages without blocking readers.
 */
export function incrementalVacuum(pages = 1000): void {
  if (!isDatabaseInitialized()) return;

  const db = getDatabase();
  try {
    db.exec(`PRAGMA incremental_vacuum(${pages})`);
  } catch {
    // Not all builds support incremental vacuum — silently skip
  }
}

/**
 * Get the database file size in bytes. Returns 0 if unable to determine.
 */
export function getDatabaseSizeBytes(): number {
  if (!isDatabaseInitialized()) return 0;

  const db = getDatabase();
  try {
    const row = db.prepare("PRAGMA page_count").get() as { page_count: number } | null;
    const sizeRow = db.prepare("PRAGMA page_size").get() as { page_size: number } | null;
    if (row && sizeRow) {
      return row.page_count * sizeRow.page_size;
    }
  } catch {
    // ignore
  }
  return 0;
}
