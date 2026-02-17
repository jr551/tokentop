/**
 * TypeScript interfaces for SQLite storage layer.
 * Based on SQLITE_ARCHITECTURE.md specification.
 */

// ============================================================================
// Enums & Literal Types
// ============================================================================

export type UsageEventSource = "agent" | "provider";
export type SessionStatus = "active" | "idle";
export type CostSource = "api" | "estimated";
export type PricingSource = "models.dev" | "fallback" | "unknown";

// ============================================================================
// App Runs Table
// ============================================================================

export interface AppRunRow {
  id?: number;
  startedAt: number; // ms since epoch
  endedAt?: number | null;
  appVersion?: string | null;
  refreshIntervalMs?: number | null;
  pid?: number | null;
  hostname?: string | null;
}

// ============================================================================
// Provider Snapshots Table
// ============================================================================

export interface ProviderSnapshotRow {
  id?: number;
  timestamp: number; // ms since epoch
  provider: string;
  usedPercent?: number | null;
  limitReached: boolean;
  resetsAt?: number | null; // ms since epoch
  tokensInput?: number | null;
  tokensOutput?: number | null;
  costUsd?: number | null;
  costSource?: CostSource | null;
  rawJson?: string | null;
}

export interface ProviderSnapshotInsert {
  timestamp: number;
  provider: string;
  usedPercent?: number | null;
  limitReached?: boolean;
  resetsAt?: number | null;
  tokensInput?: number | null;
  tokensOutput?: number | null;
  costUsd?: number | null;
  costSource?: CostSource | null;
  rawJson?: string | null;
}

// ============================================================================
// Agent Sessions Table (Logical Dimension)
// ============================================================================

export interface AgentSessionDim {
  id?: number;
  agentId: string;
  sessionId: string;
  projectPath?: string | null;
  startedAt?: number | null;
  firstSeenAt: number;
  lastSeenAt: number;
}

export interface AgentSessionUpsert {
  agentId: string;
  sessionId: string;
  projectPath?: string | null;
  startedAt?: number | null;
  firstSeenAt?: number;
  lastSeenAt: number;
}

// ============================================================================
// Agent Session Snapshots Table
// ============================================================================

export interface AgentSessionSnapshotRow {
  id?: number;
  timestamp: number;
  agentSessionId: number;
  lastActivityAt?: number | null;
  status?: SessionStatus | null;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheReadTokens: number;
  totalCacheWriteTokens: number;
  totalCostUsd: number;
  requestCount: number;
}

export interface AgentSessionSnapshotInsert {
  timestamp: number;
  agentSessionId: number;
  lastActivityAt?: number | null;
  status?: SessionStatus | null;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheReadTokens: number;
  totalCacheWriteTokens: number;
  totalCostUsd: number;
  requestCount: number;
}

// ============================================================================
// Agent Session Stream Snapshots Table
// ============================================================================

export interface AgentSessionStreamSnapshotRow {
  agentSessionSnapshotId: number;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: number;
  requestCount: number;
  pricingSource?: PricingSource | null;
}

// ============================================================================
// Usage Events Table (Append-Only Deltas)
// ============================================================================

export interface UsageEventRow {
  id?: number;
  timestamp: number;
  source: UsageEventSource;
  provider?: string | null;
  model?: string | null;
  agentId?: string | null;
  sessionId?: string | null;
  projectPath?: string | null;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: number;
  requestCount: number;
  pricingSource?: PricingSource | null;
}

export interface UsageEventInsert {
  timestamp: number;
  source: UsageEventSource;
  provider?: string | null;
  model?: string | null;
  agentId?: string | null;
  sessionId?: string | null;
  projectPath?: string | null;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: number;
  requestCount: number;
  pricingSource?: PricingSource | null;
}

// ============================================================================
// Hourly Aggregates Table
// ============================================================================

export interface HourlyAggregateRow {
  bucketStart: number; // ms since epoch, truncated to hour
  provider?: string | null;
  model?: string | null;
  agentId?: string | null;
  projectPath?: string | null;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: number;
  requestCount: number;
}

// ============================================================================
// Daily Aggregates Table
// ============================================================================

export interface DailyAggregateRow {
  date: string; // 'YYYY-MM-DD'
  provider?: string | null;
  model?: string | null;
  agentId?: string | null;
  projectPath?: string | null;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: number;
  requestCount: number;
}

// ============================================================================
// Query Types
// ============================================================================

export interface TimeSeriesPoint {
  bucketStart: number;
  tokens: number;
  costUsd: number;
  requestCount: number;
}

export interface TimeSeriesFilters {
  provider?: string;
  model?: string;
  agentId?: string;
  sessionId?: string;
  projectPath?: string;
}

export interface UsageQueryOptions {
  startTime?: number;
  endTime?: number;
  provider?: string;
  model?: string;
  agentId?: string;
  sessionId?: string;
  projectPath?: string;
  limit?: number;
  offset?: number;
}

// ============================================================================
// Delta Computation
// ============================================================================

export interface StreamTotals {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: number;
  requestCount: number;
}

/**
 * Computes the delta between two stream totals.
 * Returns null if delta is all zeros (no change worth recording).
 */
export function computeStreamDelta(
  current: StreamTotals,
  previous: StreamTotals | undefined,
): StreamTotals | null {
  if (!previous) {
    // First observation - treat as a delta from zero
    const hasNonZero =
      current.inputTokens ||
      current.outputTokens ||
      current.cacheReadTokens ||
      current.cacheWriteTokens ||
      current.costUsd ||
      current.requestCount;
    return hasNonZero ? current : null;
  }

  const delta: StreamTotals = {
    inputTokens: Math.max(0, current.inputTokens - previous.inputTokens),
    outputTokens: Math.max(0, current.outputTokens - previous.outputTokens),
    cacheReadTokens: Math.max(0, current.cacheReadTokens - previous.cacheReadTokens),
    cacheWriteTokens: Math.max(0, current.cacheWriteTokens - previous.cacheWriteTokens),
    costUsd: Math.max(0, current.costUsd - previous.costUsd),
    requestCount: Math.max(0, current.requestCount - previous.requestCount),
  };

  const hasNonZero =
    delta.inputTokens ||
    delta.outputTokens ||
    delta.cacheReadTokens ||
    delta.cacheWriteTokens ||
    delta.costUsd ||
    delta.requestCount;

  return hasNonZero ? delta : null;
}
