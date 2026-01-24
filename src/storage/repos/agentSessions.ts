import { getDatabase } from '../db.ts';
import type {
  AgentSessionDim,
  AgentSessionUpsert,
  AgentSessionSnapshotInsert,
  AgentSessionStreamSnapshotRow,
} from '../types.ts';

const UPSERT_SESSION_SQL = `
  INSERT INTO agent_sessions (agent_id, session_id, project_path, started_at, first_seen_at, last_seen_at)
  VALUES (?, ?, ?, ?, ?, ?)
  ON CONFLICT(agent_id, session_id) DO UPDATE SET
    project_path = COALESCE(excluded.project_path, agent_sessions.project_path),
    started_at = COALESCE(excluded.started_at, agent_sessions.started_at),
    last_seen_at = excluded.last_seen_at
  RETURNING id
`;

const INSERT_SNAPSHOT_SQL = `
  INSERT INTO agent_session_snapshots (
    timestamp, agent_session_id, last_activity_at, status,
    total_input_tokens, total_output_tokens, total_cache_read_tokens, total_cache_write_tokens,
    total_cost_usd, request_count
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

const INSERT_STREAM_SQL = `
  INSERT INTO agent_session_stream_snapshots (
    agent_session_snapshot_id, provider, model,
    input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
    cost_usd, request_count, pricing_source
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

export function upsertAgentSession(session: AgentSessionUpsert): number {
  const db = getDatabase();
  const now = Date.now();

  const row = db.prepare(UPSERT_SESSION_SQL).get(
    session.agentId,
    session.sessionId,
    session.projectPath ?? null,
    session.startedAt ?? null,
    session.firstSeenAt ?? now,
    session.lastSeenAt
  ) as { id: number };

  return row.id;
}

export function insertAgentSessionSnapshot(
  snapshot: AgentSessionSnapshotInsert,
  streams: Omit<AgentSessionStreamSnapshotRow, 'agentSessionSnapshotId'>[]
): number {
  const db = getDatabase();

  const insertSnapshot = db.prepare(INSERT_SNAPSHOT_SQL);
  const insertStream = db.prepare(INSERT_STREAM_SQL);

  let snapshotId = 0;

  db.transaction(() => {
    const result = insertSnapshot.run(
      snapshot.timestamp,
      snapshot.agentSessionId,
      snapshot.lastActivityAt ?? null,
      snapshot.status ?? null,
      snapshot.totalInputTokens,
      snapshot.totalOutputTokens,
      snapshot.totalCacheReadTokens,
      snapshot.totalCacheWriteTokens,
      snapshot.totalCostUsd,
      snapshot.requestCount
    );

    snapshotId = Number(result.lastInsertRowid);

    for (const stream of streams) {
      insertStream.run(
        snapshotId,
        stream.provider,
        stream.model,
        stream.inputTokens,
        stream.outputTokens,
        stream.cacheReadTokens,
        stream.cacheWriteTokens,
        stream.costUsd,
        stream.requestCount,
        stream.pricingSource ?? null
      );
    }
  })();

  return snapshotId;
}

export function getAgentSession(agentId: string, sessionId: string): AgentSessionDim | null {
  const db = getDatabase();

  const row = db.prepare(`
    SELECT * FROM agent_sessions WHERE agent_id = ? AND session_id = ?
  `).get(agentId, sessionId) as DbSessionRow | null;

  return row ? mapSessionRow(row) : null;
}

export function getRecentSessions(limit = 50): AgentSessionDim[] {
  const db = getDatabase();

  const rows = db.prepare(`
    SELECT * FROM agent_sessions
    ORDER BY last_seen_at DESC
    LIMIT ?
  `).all(limit) as DbSessionRow[];

  return rows.map(mapSessionRow);
}

export function getSessionsByProject(projectPath: string, limit = 50): AgentSessionDim[] {
  const db = getDatabase();

  const rows = db.prepare(`
    SELECT * FROM agent_sessions
    WHERE project_path = ?
    ORDER BY last_seen_at DESC
    LIMIT ?
  `).all(projectPath, limit) as DbSessionRow[];

  return rows.map(mapSessionRow);
}

interface DbSessionRow {
  id: number;
  agent_id: string;
  session_id: string;
  project_path: string | null;
  started_at: number | null;
  first_seen_at: number;
  last_seen_at: number;
}

function mapSessionRow(row: DbSessionRow): AgentSessionDim {
  return {
    id: row.id,
    agentId: row.agent_id,
    sessionId: row.session_id,
    projectPath: row.project_path,
    startedAt: row.started_at,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
  };
}
