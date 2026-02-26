import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { closeDatabase, getAppRunId, initDatabase, isDatabaseInitialized } from "@/storage/db.ts";
import {
  getLatestStreamTotalsForAllSessions,
  insertAgentSessionSnapshot,
  upsertAgentSession,
} from "@/storage/repos/agentSessions.ts";
import { insertProviderSnapshotBatch } from "@/storage/repos/providerSnapshots.ts";
import { insertUsageEventBatch } from "@/storage/repos/usageEvents.ts";
import { incrementalVacuum, pruneOldData } from "@/storage/retention.ts";
import type {
  AgentSessionSnapshotInsert,
  AgentSessionStreamSnapshotRow,
  AgentSessionUpsert,
  ProviderSnapshotInsert,
  StreamTotals,
  UsageEventInsert,
} from "@/storage/types.ts";
import { computeStreamDelta } from "@/storage/types.ts";
import { useDemoMode } from "./DemoModeContext.tsx";

interface StorageContextValue {
  isReady: boolean;
  appRunId: number | null;
  recordProviderSnapshots: (snapshots: ProviderSnapshotInsert[]) => void;
  recordUsageEvents: (events: UsageEventInsert[]) => void;
  recordAgentSession: (
    session: AgentSessionUpsert,
    snapshot: Omit<AgentSessionSnapshotInsert, "agentSessionId">,
    streams: Omit<AgentSessionStreamSnapshotRow, "agentSessionSnapshotId">[],
  ) => number | null;
}

const StorageContext = createContext<StorageContextValue | null>(null);

const SNAPSHOT_INTERVAL_MS = 300_000;
const MAX_TRACKED_SESSIONS = 1_000;
const MAX_TRACKED_STREAMS = 5_000;
const PRUNE_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

function capMapSize<K, V>(map: Map<K, V>, max: number): void {
  if (map.size <= max) return;
  const excess = map.size - max;
  const keys = map.keys();
  for (let i = 0; i < excess; i++) {
    const next = keys.next();
    if (next.done) break;
    map.delete(next.value);
  }
}

interface StorageProviderProps {
  children: ReactNode;
}

export function StorageProvider({ children }: StorageProviderProps) {
  const [isReady, setIsReady] = useState(false);
  const [appRunId, setAppRunId] = useState<number | null>(null);
  const lastProviderSnapshotRef = useRef<Map<string, number>>(new Map());
  const lastSessionSnapshotRef = useRef<Map<string, number>>(new Map());
  const previousTotalsRef = useRef<Map<string, StreamTotals>>(new Map());
  const { demoMode, simulator } = useDemoMode();

  useEffect(() => {
    // Skip real database in demo mode - all data stays in memory
    if (demoMode) {
      setIsReady(true);
      setAppRunId(null);
      return;
    }

    let mounted = true;

    async function init() {
      try {
        await initDatabase();

        // Prune expired snapshots before seeding — keeps startup fast
        try {
          const pruneResult = pruneOldData();
          if (pruneResult.agentSessionSnapshots > 0 || pruneResult.providerSnapshots > 0) {
            console.log(
              `[retention] Pruned ${pruneResult.agentSessionSnapshots} session snapshots, ` +
                `${pruneResult.providerSnapshots} provider snapshots in ${pruneResult.durationMs}ms`,
            );
            incrementalVacuum();
          }
        } catch (err) {
          console.error("Failed to prune old data:", err);
        }

        if (mounted) {
          try {
            const latestTotals = getLatestStreamTotalsForAllSessions();
            for (const row of latestTotals) {
              const streamKey = `${row.agentId}:${row.sessionId}:${row.provider}:${row.model}`;
              previousTotalsRef.current.set(streamKey, {
                inputTokens: row.inputTokens,
                outputTokens: row.outputTokens,
                cacheReadTokens: row.cacheReadTokens,
                cacheWriteTokens: row.cacheWriteTokens,
                costUsd: row.costUsd,
                requestCount: row.requestCount,
              });
            }
          } catch (err) {
            console.error("Failed to seed previous totals from DB:", err);
          }
          setIsReady(true);
          setAppRunId(getAppRunId());
        }
      } catch (err) {
        console.error("Failed to initialize database:", err);
      }
    }

    init();

    return () => {
      mounted = false;
      if (isDatabaseInitialized()) {
        closeDatabase();
      }
    };
  }, [demoMode]);

  const recordProviderSnapshots = useCallback(
    (snapshots: ProviderSnapshotInsert[]) => {
      if (!isReady || demoMode || snapshots.length === 0) return;

      const now = Date.now();
      const filtered = snapshots.filter((s) => {
        const lastTs = lastProviderSnapshotRef.current.get(s.provider) ?? 0;
        return now - lastTs >= SNAPSHOT_INTERVAL_MS;
      });

      if (filtered.length === 0) return;

      try {
        insertProviderSnapshotBatch(filtered);
        for (const s of filtered) {
          lastProviderSnapshotRef.current.set(s.provider, now);
        }
      } catch (err) {
        console.error("Failed to record provider snapshots:", err);
      }
    },
    [isReady, demoMode],
  );

  const recordUsageEvents = useCallback(
    (events: UsageEventInsert[]) => {
      if (!isReady || demoMode || events.length === 0) return;

      try {
        insertUsageEventBatch(events);
      } catch (err) {
        console.error("Failed to record usage events:", err);
      }
    },
    [isReady, demoMode],
  );

  const recordAgentSession = useCallback(
    (
      session: AgentSessionUpsert,
      snapshot: Omit<AgentSessionSnapshotInsert, "agentSessionId">,
      streams: Omit<AgentSessionStreamSnapshotRow, "agentSessionSnapshotId">[],
    ): number | null => {
      if (!isReady || demoMode) return null;

      const sessionKey = `${session.agentId}:${session.sessionId}`;
      const now = Date.now();
      const lastTs = lastSessionSnapshotRef.current.get(sessionKey) ?? 0;

      if (now - lastTs < SNAPSHOT_INTERVAL_MS) {
        return null;
      }

      try {
        const agentSessionId = upsertAgentSession(session);

        const snapshotId = insertAgentSessionSnapshot({ ...snapshot, agentSessionId }, streams);

        lastSessionSnapshotRef.current.set(sessionKey, now);

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

          const previous = previousTotalsRef.current.get(streamKey);
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

          previousTotalsRef.current.set(streamKey, current);
        }

        if (usageEvents.length > 0) {
          insertUsageEventBatch(usageEvents);
        }

        capMapSize(lastSessionSnapshotRef.current, MAX_TRACKED_SESSIONS);
        capMapSize(previousTotalsRef.current, MAX_TRACKED_STREAMS);

        return snapshotId;
      } catch (err) {
        console.error("Failed to record agent session:", err);
        return null;
      }
    },
    [isReady, demoMode],
  );

  useEffect(() => {
    if (!demoMode || !isReady || !simulator) return;

    const interval = setInterval(() => {
      simulator.tick();
    }, 1000);

    return () => clearInterval(interval);
  }, [demoMode, isReady, simulator]);

  // Periodic data retention pruning (every hour)
  useEffect(() => {
    if (demoMode || !isReady) return;

    const intervalId = setInterval(() => {
      try {
        const result = pruneOldData();
        if (result.agentSessionSnapshots > 0 || result.providerSnapshots > 0) {
          incrementalVacuum();
        }
      } catch {
        // Silently ignore periodic prune failures
      }
    }, PRUNE_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [demoMode, isReady]);

  const value: StorageContextValue = useMemo(
    () => ({
      isReady,
      appRunId,
      recordProviderSnapshots,
      recordUsageEvents,
      recordAgentSession,
    }),
    [isReady, appRunId, recordProviderSnapshots, recordUsageEvents, recordAgentSession],
  );

  return <StorageContext.Provider value={value}>{children}</StorageContext.Provider>;
}

export function useStorage(): StorageContextValue {
  const context = useContext(StorageContext);
  if (!context) {
    throw new Error("useStorage must be used within StorageProvider");
  }
  return context;
}

export function useStorageReady(): boolean {
  const { isReady } = useStorage();
  return isReady;
}
