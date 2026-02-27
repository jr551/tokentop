import type { ActivityUpdate } from "@tokentop/plugin-sdk";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPluginContext } from "@/plugins/plugin-context-factory.ts";
import { pluginRegistry } from "@/plugins/registry.ts";
import { useDemoMode } from "./DemoModeContext.tsx";
import { useLogs } from "./LogContext.tsx";
import { usePlugins } from "./PluginContext.tsx";

type ActivityListener = (delta: number, timestamp: number) => void;

interface RealTimeActivityContextValue {
  lastActivityAt: number | null;
  isWatching: boolean;
  subscribe: (listener: ActivityListener) => () => void;
}

const RealTimeActivityContext = createContext<RealTimeActivityContextValue | null>(null);

const LAST_SEEN_MAX_AGE_MS = 5 * 60_000;
const LAST_SEEN_MAX_ENTRIES = 10_000;

interface LastSeenEntry {
  tokens: number;
  updatedAt: number;
}

export function RealTimeActivityProvider({ children }: { children: ReactNode }) {
  const [lastActivityAt, setLastActivityAt] = useState<number | null>(null);
  const [isWatching, setIsWatching] = useState(false);
  const { isInitialized: pluginsInitialized } = usePlugins();
  const { debug, info } = useLogs();
  const { demoMode } = useDemoMode();

  const lastSeenRef = useRef<Map<string, LastSeenEntry>>(new Map());
  const listenersRef = useRef<Set<ActivityListener>>(new Set());
  const cleanupRef = useRef<(() => void) | null>(null);

  const subscribe = useCallback((listener: ActivityListener) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  // Store the actual handler logic in a ref so it always has access to the
  // latest `debug` without changing callback identity. This prevents the
  // useEffect below from re-running on every render (which would trigger
  // stopActivityWatch/startActivityWatch churn on every plugin).
  const handleActivityUpdateRef = useRef<(update: ActivityUpdate) => void>(() => {});
  handleActivityUpdateRef.current = (update: ActivityUpdate) => {
    const key = `${update.sessionId}:${update.messageId}`;
    const prev = lastSeenRef.current.get(key);
    const prevTokens = prev?.tokens ?? 0;
    const input = update.tokens.input ?? 0;
    const output = update.tokens.output ?? 0;
    const reasoning = update.tokens.reasoning ?? 0;
    const newTokens = input + output + reasoning;
    if (!Number.isFinite(newTokens)) return;
    const delta = Math.max(0, newTokens - prevTokens);

    if (delta > 0) {
      lastSeenRef.current.set(key, { tokens: newTokens, updatedAt: Date.now() });
      setLastActivityAt(update.timestamp);
      debug(`Real-time activity: +${delta} tokens`, { sessionId: update.sessionId }, "realtime");

      for (const listener of listenersRef.current) {
        listener(delta, update.timestamp);
      }
    }
  };

  // Stable wrapper — identity never changes, so the useEffect below only
  // runs once per plugin initialization (not on every debug/info change).
  const handleActivityUpdate = useCallback(
    (update: ActivityUpdate) => handleActivityUpdateRef.current(update),
    [],
  );

  useEffect(() => {
    if (demoMode || !pluginsInitialized) return;

    const agentPlugins = pluginRegistry.getAll("agent");
    const cleanups: (() => void)[] = [];

    for (const plugin of agentPlugins) {
      if (plugin.capabilities.realTimeTracking && plugin.startActivityWatch) {
        const ctx = createPluginContext(plugin.id, plugin.permissions);
        info(`Starting real-time activity watch for ${plugin.id}`, undefined, "realtime");
        plugin.startActivityWatch(ctx, handleActivityUpdate);

        if (plugin.stopActivityWatch) {
          const stopFn = plugin.stopActivityWatch.bind(plugin, ctx);
          cleanups.push(stopFn);
        }
      }
    }

    if (cleanups.length > 0) {
      setIsWatching(true);
      cleanupRef.current = () => {
        cleanups.forEach((fn) => {
          fn();
        });
        setIsWatching(false);
      };
    }

    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
    };
  }, [pluginsInitialized, demoMode, handleActivityUpdate]);

  useEffect(() => {
    const interval = setInterval(() => {
      const map = lastSeenRef.current;
      const now = Date.now();

      for (const [key, entry] of map) {
        if (now - entry.updatedAt > LAST_SEEN_MAX_AGE_MS) {
          map.delete(key);
        }
      }

      if (map.size > LAST_SEEN_MAX_ENTRIES) {
        const excess = map.size - LAST_SEEN_MAX_ENTRIES;
        const keys = map.keys();
        for (let i = 0; i < excess; i++) {
          const next = keys.next();
          if (next.done) break;
          map.delete(next.value);
        }
      }
    }, 30_000);

    return () => clearInterval(interval);
  }, []);

  const value: RealTimeActivityContextValue = {
    lastActivityAt,
    isWatching,
    subscribe,
  };

  return (
    <RealTimeActivityContext.Provider value={value}>{children}</RealTimeActivityContext.Provider>
  );
}

export function useRealTimeActivity(): RealTimeActivityContextValue {
  const context = useContext(RealTimeActivityContext);
  if (!context) {
    throw new Error("useRealTimeActivity must be used within RealTimeActivityProvider");
  }
  return context;
}
