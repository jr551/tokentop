export {
  closeDatabase,
  getAppRunId,
  getDatabase,
  initDatabase,
  isDatabaseInitialized,
} from "./db.ts";
export { PATHS } from "./paths.ts";
export type { LatestStreamTotals } from "./repos/agentSessions.ts";
export {
  getAgentSession,
  getLatestStreamTotalsForAllSessions,
  getRecentSessions,
  getSessionsByProject,
  insertAgentSessionSnapshot,
  upsertAgentSession,
} from "./repos/agentSessions.ts";
export {
  getLatestProviderSnapshot,
  insertProviderSnapshot,
  insertProviderSnapshotBatch,
  queryProviderSnapshots,
} from "./repos/providerSnapshots.ts";
export type {
  ModelDailyCost,
  ProjectDailyCost,
  ProviderDailyCost,
  SessionActivityPoint,
} from "./repos/usageEvents.ts";
export {
  calculateBurnRate,
  getSessionActivityTimeline,
  getTotalUsageInWindow,
  insertUsageEvent,
  insertUsageEventBatch,
  queryModelDailyCosts,
  queryProjectDailyCosts,
  queryProviderDailyCosts,
  queryUsageTimeSeries,
} from "./repos/usageEvents.ts";

export type {
  AgentSessionDim,
  AgentSessionSnapshotInsert,
  AgentSessionSnapshotRow,
  AgentSessionStreamSnapshotRow,
  AgentSessionUpsert,
  AppRunRow,
  CostSource,
  DailyAggregateRow,
  HourlyAggregateRow,
  PricingSource,
  ProviderSnapshotInsert,
  ProviderSnapshotRow,
  SessionStatus,
  StreamTotals,
  TimeSeriesFilters,
  TimeSeriesPoint,
  UsageEventInsert,
  UsageEventRow,
  UsageEventSource,
  UsageQueryOptions,
} from "./types.ts";

export { computeStreamDelta } from "./types.ts";
