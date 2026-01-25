import { getDatabase } from '../db.ts';
import type { UsageEventInsert, TimeSeriesPoint, TimeSeriesFilters } from '../types.ts';

const INSERT_SQL = `
  INSERT INTO usage_events (
    timestamp, source, provider, model, agent_id, session_id, project_path,
    input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
    cost_usd, request_count, pricing_source
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

export function insertUsageEvent(event: UsageEventInsert): number {
  const db = getDatabase();
  const stmt = db.prepare(INSERT_SQL);

  const result = stmt.run(
    event.timestamp,
    event.source,
    event.provider ?? null,
    event.model ?? null,
    event.agentId ?? null,
    event.sessionId ?? null,
    event.projectPath ?? null,
    event.inputTokens,
    event.outputTokens,
    event.cacheReadTokens,
    event.cacheWriteTokens,
    event.costUsd,
    event.requestCount,
    event.pricingSource ?? null
  );

  return Number(result.lastInsertRowid);
}

export function insertUsageEventBatch(events: UsageEventInsert[]): void {
  if (events.length === 0) return;

  const db = getDatabase();
  const stmt = db.prepare(INSERT_SQL);

  const insertMany = db.transaction((items: UsageEventInsert[]) => {
    for (const e of items) {
      stmt.run(
        e.timestamp,
        e.source,
        e.provider ?? null,
        e.model ?? null,
        e.agentId ?? null,
        e.sessionId ?? null,
        e.projectPath ?? null,
        e.inputTokens,
        e.outputTokens,
        e.cacheReadTokens,
        e.cacheWriteTokens,
        e.costUsd,
        e.requestCount,
        e.pricingSource ?? null
      );
    }
  });

  insertMany(events);
}

export function queryUsageTimeSeries(
  startMs: number,
  endMs: number,
  bucketMs: number,
  filters: TimeSeriesFilters = {}
): TimeSeriesPoint[] {
  const db = getDatabase();

  const conditions: string[] = ['timestamp >= ?', 'timestamp <= ?'];
  const params: (string | number)[] = [startMs, endMs];

  if (filters.provider) {
    conditions.push('provider = ?');
    params.push(filters.provider);
  }
  if (filters.model) {
    conditions.push('model = ?');
    params.push(filters.model);
  }
  if (filters.agentId) {
    conditions.push('agent_id = ?');
    params.push(filters.agentId);
  }
  if (filters.sessionId) {
    conditions.push('session_id = ?');
    params.push(filters.sessionId);
  }
  if (filters.projectPath) {
    conditions.push('project_path = ?');
    params.push(filters.projectPath);
  }

  const sql = `
    SELECT
      (timestamp / ${bucketMs} * ${bucketMs}) AS bucket_start,
      COALESCE(SUM(input_tokens + output_tokens), 0) AS tokens,
      COALESCE(SUM(cost_usd), 0) AS cost_usd,
      COALESCE(SUM(request_count), 0) AS request_count
    FROM usage_events
    WHERE ${conditions.join(' AND ')}
    GROUP BY bucket_start
    ORDER BY bucket_start ASC
  `;

  const rows = db.prepare(sql).all(...params) as Array<{
    bucket_start: number;
    tokens: number;
    cost_usd: number;
    request_count: number;
  }>;

  return rows.map(r => ({
    bucketStart: r.bucket_start,
    tokens: r.tokens,
    costUsd: r.cost_usd,
    requestCount: r.request_count,
  }));
}

export function calculateBurnRate(windowMs: number, nowMs = Date.now()): { costPerHour: number; tokensPerMinute: number } {
  const db = getDatabase();
  const startMs = nowMs - windowMs;

  const row = db.prepare(`
    SELECT
      COALESCE(SUM(cost_usd), 0) AS cost,
      COALESCE(SUM(input_tokens + output_tokens), 0) AS tokens
    FROM usage_events
    WHERE timestamp >= ? AND timestamp <= ?
  `).get(startMs, nowMs) as { cost: number; tokens: number };

  const hours = windowMs / (1000 * 60 * 60);
  const minutes = windowMs / (1000 * 60);

  return {
    costPerHour: hours > 0 ? row.cost / hours : 0,
    tokensPerMinute: minutes > 0 ? row.tokens / minutes : 0,
  };
}

export function getTotalUsageInWindow(startMs: number, endMs: number): {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  requestCount: number;
} {
  const db = getDatabase();

  const row = db.prepare(`
    SELECT
      COALESCE(SUM(input_tokens), 0) AS input_tokens,
      COALESCE(SUM(output_tokens), 0) AS output_tokens,
      COALESCE(SUM(cost_usd), 0) AS cost_usd,
      COALESCE(SUM(request_count), 0) AS request_count
    FROM usage_events
    WHERE timestamp >= ? AND timestamp <= ?
  `).get(startMs, endMs) as {
    input_tokens: number;
    output_tokens: number;
    cost_usd: number;
    request_count: number;
  };

  return {
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    costUsd: row.cost_usd,
    requestCount: row.request_count,
  };
}

export interface SessionActivityPoint {
  timestamp: number;
  tokens: number;
}

export function getSessionActivityTimeline(sessionId: string): SessionActivityPoint[] {
  const db = getDatabase();

  const rows = db.prepare(`
    SELECT timestamp, (input_tokens + output_tokens) AS tokens
    FROM usage_events
    WHERE session_id = ?
    ORDER BY timestamp ASC
  `).all(sessionId) as Array<{ timestamp: number; tokens: number }>;

  return rows.map(r => ({
    timestamp: r.timestamp,
    tokens: r.tokens,
  }));
}
