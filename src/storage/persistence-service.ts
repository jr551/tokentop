/**
 * Module-level session persistence service.
 *
 * All mutable state is stored on globalThis to survive bun --hot HMR
 * reloads and React component remounts. This decouples persistence
 * from React's lifecycle entirely.
 *
 * Call persistSessions() on every poll tick (1s). The service internally:
 *   Gate 1: Skips sessions whose usage data hasn't changed (fingerprint)
 *   Gate 2: Throttles writes to at most once per SNAPSHOT_INTERVAL_MS
 *
 * Both gates update their state only on successful writes, ensuring
 * deferred writes when the throttle expires.
 */

import { isDatabaseInitialized } from "./db.ts";
import {
  getLatestStreamTotalsForAllSessions,
  insertAgentSessionSnapshot,
  upsertAgentSession,
} from "./repos/agentSessions.ts";
import { insertUsageEventBatch } from "./repos/usageEvents.ts";
import type {
  AgentSessionSnapshotInsert,
  AgentSessionStreamSnapshotRow,
  AgentSessionUpsert,
  StreamTotals,
  UsageEventInsert,
} from "./types.ts";
import { computeStreamDelta } from "./types.ts";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Minimum interval between DB writes for the same session */
const SNAPSHOT_INTERVAL_MS = 300_000; // 5 minutes

// ---------------------------------------------------------------------------
// Global state (survives bun --hot HMR and React remounts)
// ---------------------------------------------------------------------------

interface PersistenceState {
  /** Timestamp of last successful DB write per session key */
  lastWriteTimestamps: Map<string, number>;
  /** Usage-based fingerprint per session key (updated only on successful write) */
  sessionFingerprints: Map<string, string>;
  /** Previous stream totals for delta computation */
  previousStreamTotals: Map<string, StreamTotals>;
  /** Whether startup seeding has completed */
  seeded: boolean;
}

declare global {
  // eslint-disable-next-line no-var
  var __tokentopPersistence: PersistenceState | undefined;
}

function getState(): PersistenceState {
  if (!globalThis.__tokentopPersistence) {
    globalThis.__tokentopPersistence = {
      lastWriteTimestamps: new Map(),
      sessionFingerprints: new Map(),
      previousStreamTotals: new Map(),
      seeded: false,
    };
  }
  return globalThis.__tokentopPersistence;
}

// ---------------------------------------------------------------------------
// Fingerprinting
// ---------------------------------------------------------------------------

/**
 * Compute a fingerprint based on usage data only (not lastActivityAt).
 * This ensures inactive sessions with stable usage don't trigger writes,
 * while active sessions that consume tokens do.
 */
function computeFingerprint(snapshot: Omit<AgentSessionSnapshotInsert, "agentSessionId">): string {
  return `${snapshot.totalCostUsd}:${snapshot.requestCount}:${snapshot.totalInputTokens}:${snapshot.totalOutputTokens}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface SessionPersistData {
  session: AgentSessionUpsert;
  snapshot: Omit<AgentSessionSnapshotInsert, "agentSessionId">;
  streams: Omit<AgentSessionStreamSnapshotRow, "agentSessionSnapshotId">[];
}

/**
 * Persist session data to the database with per-session throttling.
 *
 * Safe to call on every poll tick (every 1s). The service internally:
 *   1. Skips sessions whose usage data hasn't changed (fingerprint gate)
 *   2. Throttles writes to at most once per SNAPSHOT_INTERVAL_MS per session
 *
 * @returns Number of sessions actually written to DB
 */
export function persistSessions(sessions: SessionPersistData[]): number {
  if (!isDatabaseInitialized()) return 0;

  const state = getState();
  const now = Date.now();
  let persistedCount = 0;

  for (const { session, snapshot, streams } of sessions) {
    const sessionKey = `${session.agentId}:${session.sessionId}`;

    // Gate 1: Skip sessions whose usage data hasn't changed since last write
    const fp = computeFingerprint(snapshot);
    if (state.sessionFingerprints.get(sessionKey) === fp) continue;

    // Gate 2: Throttle writes to once per interval per session
    const lastTs = state.lastWriteTimestamps.get(sessionKey) ?? 0;
    if (now - lastTs < SNAPSHOT_INTERVAL_MS) continue;

    // Both gates passed — write to DB
    try {
      const agentSessionId = upsertAgentSession(session);
      insertAgentSessionSnapshot({ ...snapshot, agentSessionId }, streams);

      // Compute and emit usage event deltas
      const usageEvents: UsageEventInsert[] = [];
      for (const stream of streams) {
        const streamKey = `${sessionKey}:${stream.provider}:${stream.model}`;
        const current: StreamTotals = {
          inputTokens: stream.inputTokens,
          outputTokens: stream.outputTokens,
          cacheReadTokens: stream.cacheReadTokens,
          cacheWriteTokens: stream.cacheWriteTokens,
          costUsd: stream.costUsd,
          requestCount: stream.requestCount,
        };

        const previous = state.previousStreamTotals.get(streamKey);
        const delta = computeStreamDelta(current, previous);

        if (delta) {
          usageEvents.push({
            timestamp: now,
            source: "agent",
            provider: stream.provider,
            model: stream.model,
            agentId: session.agentId,
            sessionId: session.sessionId,
            projectPath: session.projectPath ?? null,
            inputTokens: delta.inputTokens,
            outputTokens: delta.outputTokens,
            cacheReadTokens: delta.cacheReadTokens,
            cacheWriteTokens: delta.cacheWriteTokens,
            costUsd: delta.costUsd,
            requestCount: delta.requestCount,
            pricingSource: stream.pricingSource ?? null,
          });
        }

        state.previousStreamTotals.set(streamKey, current);
      }

      if (usageEvents.length > 0) {
        insertUsageEventBatch(usageEvents);
      }

      // Update tracking state ONLY on successful write
      state.lastWriteTimestamps.set(sessionKey, now);
      state.sessionFingerprints.set(sessionKey, fp);
      persistedCount++;
    } catch (err) {
      console.error("Failed to persist session:", err);
    }
  }

  return persistedCount;
}

/**
 * Seed previous stream totals from the database.
 * Called once at startup after DB initialization to ensure
 * accurate delta computation from the first persistence call.
 */
export function seedPreviousTotals(): void {
  const state = getState();
  if (state.seeded) return;

  try {
    const latestTotals = getLatestStreamTotalsForAllSessions();
    for (const row of latestTotals) {
      const streamKey = `${row.agentId}:${row.sessionId}:${row.provider}:${row.model}`;
      state.previousStreamTotals.set(streamKey, {
        inputTokens: row.inputTokens,
        outputTokens: row.outputTokens,
        cacheReadTokens: row.cacheReadTokens,
        cacheWriteTokens: row.cacheWriteTokens,
        costUsd: row.costUsd,
        requestCount: row.requestCount,
      });
    }
    state.seeded = true;
  } catch (err) {
    console.error("Failed to seed previous totals from DB:", err);
  }
}
