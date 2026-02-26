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
import { seedPreviousTotals } from "@/storage/persistence-service.ts";
import { insertProviderSnapshotBatch } from "@/storage/repos/providerSnapshots.ts";
import { insertUsageEventBatch } from "@/storage/repos/usageEvents.ts";
import { incrementalVacuum, pruneOldData } from "@/storage/retention.ts";
import type { ProviderSnapshotInsert, UsageEventInsert } from "@/storage/types.ts";
import { useDemoMode } from "./DemoModeContext.tsx";

interface StorageContextValue {
  isReady: boolean;
  appRunId: number | null;
  recordProviderSnapshots: (snapshots: ProviderSnapshotInsert[]) => void;
  recordUsageEvents: (events: UsageEventInsert[]) => void;
}

const StorageContext = createContext<StorageContextValue | null>(null);

const PROVIDER_SNAPSHOT_INTERVAL_MS = 300_000;
const PRUNE_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

interface StorageProviderProps {
  children: ReactNode;
}

export function StorageProvider({ children }: StorageProviderProps) {
  const [isReady, setIsReady] = useState(false);
  const [appRunId, setAppRunId] = useState<number | null>(null);
  const lastProviderSnapshotRef = useRef<Map<string, number>>(new Map());
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
          // Seed the persistence service with previous stream totals from DB
          seedPreviousTotals();
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
        return now - lastTs >= PROVIDER_SNAPSHOT_INTERVAL_MS;
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
    }),
    [isReady, appRunId, recordProviderSnapshots, recordUsageEvents],
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
