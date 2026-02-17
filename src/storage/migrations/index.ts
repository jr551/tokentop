import type { Database } from "bun:sqlite";

export interface Migration {
  version: number;
  up: (db: Database) => void;
}

export const migrations: Migration[] = [
  {
    version: 1,
    up: (db: Database) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS meta (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS app_runs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          started_at INTEGER NOT NULL,
          ended_at INTEGER,
          app_version TEXT,
          refresh_interval_ms INTEGER,
          pid INTEGER,
          hostname TEXT
        );

        CREATE TABLE IF NOT EXISTS provider_snapshots (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          timestamp INTEGER NOT NULL,
          provider TEXT NOT NULL,
          used_percent REAL,
          limit_reached INTEGER NOT NULL DEFAULT 0,
          resets_at INTEGER,
          tokens_input INTEGER,
          tokens_output INTEGER,
          cost_usd REAL,
          cost_source TEXT,
          raw_json TEXT,
          created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
        );

        CREATE INDEX IF NOT EXISTS idx_provider_snapshots_provider_ts
          ON provider_snapshots(provider, timestamp);

        CREATE INDEX IF NOT EXISTS idx_provider_snapshots_ts
          ON provider_snapshots(timestamp);

        CREATE TABLE IF NOT EXISTS agent_sessions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          agent_id TEXT NOT NULL,
          session_id TEXT NOT NULL,
          project_path TEXT,
          started_at INTEGER,
          first_seen_at INTEGER NOT NULL,
          last_seen_at INTEGER NOT NULL,
          UNIQUE(agent_id, session_id)
        );

        CREATE INDEX IF NOT EXISTS idx_agent_sessions_last_seen
          ON agent_sessions(last_seen_at);

        CREATE INDEX IF NOT EXISTS idx_agent_sessions_project
          ON agent_sessions(project_path);

        CREATE TABLE IF NOT EXISTS agent_session_snapshots (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          timestamp INTEGER NOT NULL,
          agent_session_id INTEGER NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
          last_activity_at INTEGER,
          status TEXT,
          total_input_tokens INTEGER NOT NULL DEFAULT 0,
          total_output_tokens INTEGER NOT NULL DEFAULT 0,
          total_cache_read_tokens INTEGER NOT NULL DEFAULT 0,
          total_cache_write_tokens INTEGER NOT NULL DEFAULT 0,
          total_cost_usd REAL NOT NULL DEFAULT 0,
          request_count INTEGER NOT NULL DEFAULT 0
        );

        CREATE INDEX IF NOT EXISTS idx_agent_session_snapshots_session_ts
          ON agent_session_snapshots(agent_session_id, timestamp);

        CREATE INDEX IF NOT EXISTS idx_agent_session_snapshots_ts
          ON agent_session_snapshots(timestamp);

        CREATE TABLE IF NOT EXISTS agent_session_stream_snapshots (
          agent_session_snapshot_id INTEGER NOT NULL REFERENCES agent_session_snapshots(id) ON DELETE CASCADE,
          provider TEXT NOT NULL,
          model TEXT NOT NULL,
          input_tokens INTEGER NOT NULL DEFAULT 0,
          output_tokens INTEGER NOT NULL DEFAULT 0,
          cache_read_tokens INTEGER NOT NULL DEFAULT 0,
          cache_write_tokens INTEGER NOT NULL DEFAULT 0,
          cost_usd REAL NOT NULL DEFAULT 0,
          request_count INTEGER NOT NULL DEFAULT 0,
          pricing_source TEXT,
          PRIMARY KEY (agent_session_snapshot_id, provider, model)
        );

        CREATE INDEX IF NOT EXISTS idx_agent_stream_provider_model
          ON agent_session_stream_snapshots(provider, model);

        CREATE TABLE IF NOT EXISTS usage_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          timestamp INTEGER NOT NULL,
          source TEXT NOT NULL,
          provider TEXT,
          model TEXT,
          agent_id TEXT,
          session_id TEXT,
          project_path TEXT,
          input_tokens INTEGER NOT NULL DEFAULT 0,
          output_tokens INTEGER NOT NULL DEFAULT 0,
          cache_read_tokens INTEGER NOT NULL DEFAULT 0,
          cache_write_tokens INTEGER NOT NULL DEFAULT 0,
          cost_usd REAL NOT NULL DEFAULT 0,
          request_count INTEGER NOT NULL DEFAULT 0,
          pricing_source TEXT,
          created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
        );

        CREATE INDEX IF NOT EXISTS idx_usage_events_ts ON usage_events(timestamp);
        CREATE INDEX IF NOT EXISTS idx_usage_events_provider_ts ON usage_events(provider, timestamp);
        CREATE INDEX IF NOT EXISTS idx_usage_events_provider_model_ts ON usage_events(provider, model, timestamp);
        CREATE INDEX IF NOT EXISTS idx_usage_events_agent_ts ON usage_events(agent_id, timestamp);
        CREATE INDEX IF NOT EXISTS idx_usage_events_session_ts ON usage_events(session_id, timestamp);
        CREATE INDEX IF NOT EXISTS idx_usage_events_project_ts ON usage_events(project_path, timestamp);

        CREATE TABLE IF NOT EXISTS hourly_aggregates (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          bucket_start INTEGER NOT NULL,
          provider TEXT NOT NULL DEFAULT '',
          model TEXT NOT NULL DEFAULT '',
          agent_id TEXT NOT NULL DEFAULT '',
          project_path TEXT NOT NULL DEFAULT '',
          input_tokens INTEGER NOT NULL DEFAULT 0,
          output_tokens INTEGER NOT NULL DEFAULT 0,
          cache_read_tokens INTEGER NOT NULL DEFAULT 0,
          cache_write_tokens INTEGER NOT NULL DEFAULT 0,
          cost_usd REAL NOT NULL DEFAULT 0,
          request_count INTEGER NOT NULL DEFAULT 0,
          UNIQUE (bucket_start, provider, model, agent_id, project_path)
        );

        CREATE INDEX IF NOT EXISTS idx_hourly_aggregates_bucket ON hourly_aggregates(bucket_start);

        CREATE TABLE IF NOT EXISTS daily_aggregates (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          date TEXT NOT NULL,
          provider TEXT NOT NULL DEFAULT '',
          model TEXT NOT NULL DEFAULT '',
          agent_id TEXT NOT NULL DEFAULT '',
          project_path TEXT NOT NULL DEFAULT '',
          input_tokens INTEGER NOT NULL DEFAULT 0,
          output_tokens INTEGER NOT NULL DEFAULT 0,
          cache_read_tokens INTEGER NOT NULL DEFAULT 0,
          cache_write_tokens INTEGER NOT NULL DEFAULT 0,
          cost_usd REAL NOT NULL DEFAULT 0,
          request_count INTEGER NOT NULL DEFAULT 0,
          UNIQUE (date, provider, model, agent_id, project_path)
        );

        CREATE INDEX IF NOT EXISTS idx_daily_aggregates_date ON daily_aggregates(date);
      `);
    },
  },
];

export function getCurrentVersion(db: Database): number {
  const result = db.prepare("PRAGMA user_version").get() as { user_version: number } | null;
  return result?.user_version ?? 0;
}

export function setVersion(db: Database, version: number): void {
  db.exec(`PRAGMA user_version = ${version}`);
}

export function applyMigrations(db: Database): void {
  const currentVersion = getCurrentVersion(db);

  for (const migration of migrations) {
    if (migration.version > currentVersion) {
      db.transaction(() => {
        migration.up(db);
        setVersion(db, migration.version);
      })();
    }
  }
}
