import { getDatabase } from '../db.ts';
import type { ProviderSnapshotInsert, ProviderSnapshotRow, CostSource } from '../types.ts';

const INSERT_SQL = `
  INSERT INTO provider_snapshots (
    timestamp, provider, used_percent, limit_reached, resets_at,
    tokens_input, tokens_output, cost_usd, cost_source, raw_json
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

const QUERY_BY_PROVIDER_SQL = `
  SELECT * FROM provider_snapshots
  WHERE provider = ? AND timestamp >= ? AND timestamp <= ?
  ORDER BY timestamp DESC
  LIMIT ?
`;

const QUERY_LATEST_SQL = `
  SELECT * FROM provider_snapshots
  WHERE provider = ?
  ORDER BY timestamp DESC
  LIMIT 1
`;

export function insertProviderSnapshot(snapshot: ProviderSnapshotInsert): number {
  const db = getDatabase();
  const stmt = db.prepare(INSERT_SQL);

  const result = stmt.run(
    snapshot.timestamp,
    snapshot.provider,
    snapshot.usedPercent ?? null,
    snapshot.limitReached ? 1 : 0,
    snapshot.resetsAt ?? null,
    snapshot.tokensInput ?? null,
    snapshot.tokensOutput ?? null,
    snapshot.costUsd ?? null,
    snapshot.costSource ?? null,
    snapshot.rawJson ?? null
  );

  return Number(result.lastInsertRowid);
}

export function insertProviderSnapshotBatch(snapshots: ProviderSnapshotInsert[]): void {
  if (snapshots.length === 0) return;

  const db = getDatabase();
  const stmt = db.prepare(INSERT_SQL);

  const insertMany = db.transaction((items: ProviderSnapshotInsert[]) => {
    for (const s of items) {
      stmt.run(
        s.timestamp,
        s.provider,
        s.usedPercent ?? null,
        s.limitReached ? 1 : 0,
        s.resetsAt ?? null,
        s.tokensInput ?? null,
        s.tokensOutput ?? null,
        s.costUsd ?? null,
        s.costSource ?? null,
        s.rawJson ?? null
      );
    }
  });

  insertMany(snapshots);
}

export function queryProviderSnapshots(
  provider: string,
  startMs: number,
  endMs: number,
  limit = 100
): ProviderSnapshotRow[] {
  const db = getDatabase();
  const rows = db.prepare(QUERY_BY_PROVIDER_SQL).all(provider, startMs, endMs, limit) as DbRow[];
  return rows.map(mapRow);
}

export function getLatestProviderSnapshot(provider: string): ProviderSnapshotRow | null {
  const db = getDatabase();
  const row = db.prepare(QUERY_LATEST_SQL).get(provider) as DbRow | null;
  return row ? mapRow(row) : null;
}

interface DbRow {
  id: number;
  timestamp: number;
  provider: string;
  used_percent: number | null;
  limit_reached: number;
  resets_at: number | null;
  tokens_input: number | null;
  tokens_output: number | null;
  cost_usd: number | null;
  cost_source: string | null;
  raw_json: string | null;
}

function mapRow(row: DbRow): ProviderSnapshotRow {
  return {
    id: row.id,
    timestamp: row.timestamp,
    provider: row.provider,
    usedPercent: row.used_percent,
    limitReached: row.limit_reached === 1,
    resetsAt: row.resets_at,
    tokensInput: row.tokens_input,
    tokensOutput: row.tokens_output,
    costUsd: row.cost_usd,
    costSource: row.cost_source as CostSource | null,
    rawJson: row.raw_json,
  };
}
