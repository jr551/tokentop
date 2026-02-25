import type { ScrollBoxRenderable } from "@opentui/core";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { pluginRegistry } from "@/plugins/registry.ts";
import { checkAllPluginUpdates, type PluginUpdateInfo } from "@/plugins/update-checker.ts";
import { useInputFocus } from "../contexts/InputContext.tsx";
import { type LogEntry, type LogLevel, useLogs } from "../contexts/LogContext.tsx";
import { useColors } from "../contexts/ThemeContext.tsx";
import { ModalBackdrop, Z_INDEX } from "./ModalBackdrop.tsx";

type DebugTab = "logs" | "inspector" | "plugins";
type PluginSort = "name" | "type" | "source";

interface DebugInspectorData {
  sessions: Array<{
    sessionId: string;
    agentName: string;
    status: string;
    totals: { input: number; output: number };
    lastActivityAt: number;
  }>;
  debugData: {
    lastDeltaTokens: number;
    lastDt: number;
    bucketsShifted: number;
    currentBucketValue: number;
    refreshCount: number;
    lastRefreshTime: number;
  };
  activity: {
    instantRate: number;
    avgRate: number;
    isSpike: boolean;
  };
  sparkData: number[];
}

interface DebugPanelProps {
  onClose: () => void;
  inspectorData?: DebugInspectorData;
}

function padRight(str: string, len: number): string {
  return str.length >= len ? str.slice(0, len) : str + " ".repeat(len - str.length);
}

const LOG_LEVELS: LogLevel[] = ["debug", "info", "warn", "error"];
const LOG_LEVEL_RANK: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

function filterByLevel(logs: LogEntry[], minLevel: LogLevel): LogEntry[] {
  const minRank = LOG_LEVEL_RANK[minLevel];
  if (minRank === 0) return logs;
  return logs.filter((e) => LOG_LEVEL_RANK[e.level] >= minRank);
}

function nextLevel(current: LogLevel): LogLevel {
  const idx = LOG_LEVELS.indexOf(current);
  return LOG_LEVELS[(idx + 1) % LOG_LEVELS.length] ?? "debug";
}

export function DebugPanel({ onClose, inspectorData }: DebugPanelProps) {
  const colors = useColors();
  const { width: termWidth, height: termHeight } = useTerminalDimensions();
  const { logs, clearLogs } = useLogs();
  const { setInputFocused } = useInputFocus();
  const [activeTab, setActiveTab] = useState<DebugTab>("logs");
  const [follow, setFollow] = useState(true);
  const [minLevel, setMinLevel] = useState<LogLevel>("info");
  const [pluginSort, setPluginSort] = useState<PluginSort>("type");
  const scrollboxRef = useRef<ScrollBoxRenderable>(null);
  const inspectorScrollboxRef = useRef<ScrollBoxRenderable>(null);
  const pluginsScrollboxRef = useRef<ScrollBoxRenderable>(null);
  const lastKeyRef = useRef<string | null>(null);

  const width = Math.min(termWidth - 4, 120);
  const height = Math.min(termHeight - 4, 35);
  const SCROLL_STEP = 3;

  useEffect(() => {
    setInputFocused(true);
    return () => setInputFocused(false);
  }, [setInputFocused]);

  useEffect(() => {
    if (follow && activeTab === "logs") {
      const scrollbox = scrollboxRef.current;
      if (scrollbox) {
        scrollbox.scrollTo(scrollbox.scrollHeight);
      }
    }
  }, [logs.length, follow, activeTab]);

  useKeyboard((key) => {
    if (key.name === "escape") {
      onClose();
      return;
    }

    const tabs: DebugTab[] = ["logs", "inspector", "plugins"];
    if (key.name === "tab" || key.sequence === "[" || key.sequence === "]") {
      setActiveTab((prev) => tabs[(tabs.indexOf(prev) + 1) % tabs.length] ?? "logs");
      lastKeyRef.current = null;
      return;
    }
    if (key.name === "1") {
      setActiveTab("logs");
      lastKeyRef.current = null;
      return;
    }
    if (key.name === "2") {
      setActiveTab("inspector");
      lastKeyRef.current = null;
      return;
    }
    if (key.name === "3") {
      setActiveTab("plugins");
      lastKeyRef.current = null;
      return;
    }

    if (activeTab === "logs") {
      if (key.name === "f") {
        setFollow((prev) => !prev);
        return;
      }
      if (key.name === "l") {
        setMinLevel((prev) => nextLevel(prev));
        return;
      }
      if (key.name === "c") {
        clearLogs();
        return;
      }
      if (key.name === "down" || key.name === "j") {
        const box = scrollboxRef.current;
        if (box) box.scrollTo(Math.min(box.scrollTop + SCROLL_STEP, box.scrollHeight));
        setFollow(false);
        lastKeyRef.current = null;
        return;
      }
      if (key.name === "up" || key.name === "k") {
        const box = scrollboxRef.current;
        if (box) box.scrollTo(Math.max(box.scrollTop - SCROLL_STEP, 0));
        setFollow(false);
        lastKeyRef.current = null;
        return;
      }
      if (key.shift && key.name === "g") {
        scrollboxRef.current?.scrollTo(scrollboxRef.current.scrollHeight);
        lastKeyRef.current = null;
        return;
      }
      if (key.name === "g") {
        if (lastKeyRef.current === "g") {
          scrollboxRef.current?.scrollTo(0);
          lastKeyRef.current = null;
        } else {
          lastKeyRef.current = "g";
        }
        return;
      }
    }

    if (activeTab === "inspector") {
      if (key.name === "down" || key.name === "j") {
        const box = inspectorScrollboxRef.current;
        if (box) box.scrollTo(Math.min(box.scrollTop + SCROLL_STEP, box.scrollHeight));
        lastKeyRef.current = null;
        return;
      }
      if (key.name === "up" || key.name === "k") {
        const box = inspectorScrollboxRef.current;
        if (box) box.scrollTo(Math.max(box.scrollTop - SCROLL_STEP, 0));
        lastKeyRef.current = null;
        return;
      }
      if (key.shift && key.name === "g") {
        inspectorScrollboxRef.current?.scrollTo(inspectorScrollboxRef.current.scrollHeight);
        lastKeyRef.current = null;
        return;
      }
      if (key.name === "g") {
        if (lastKeyRef.current === "g") {
          inspectorScrollboxRef.current?.scrollTo(0);
          lastKeyRef.current = null;
        } else {
          lastKeyRef.current = "g";
        }
        return;
      }
    }

    if (activeTab === "plugins") {
      if (key.name === "s") {
        setPluginSort((prev) => {
          const order: PluginSort[] = ["name", "type", "source"];
          return order[(order.indexOf(prev) + 1) % order.length] ?? "name";
        });
        return;
      }
      if (key.name === "down" || key.name === "j") {
        const box = pluginsScrollboxRef.current;
        if (box) box.scrollTo(Math.min(box.scrollTop + SCROLL_STEP, box.scrollHeight));
        lastKeyRef.current = null;
        return;
      }
      if (key.name === "up" || key.name === "k") {
        const box = pluginsScrollboxRef.current;
        if (box) box.scrollTo(Math.max(box.scrollTop - SCROLL_STEP, 0));
        lastKeyRef.current = null;
        return;
      }
      if (key.shift && key.name === "g") {
        pluginsScrollboxRef.current?.scrollTo(pluginsScrollboxRef.current.scrollHeight);
        lastKeyRef.current = null;
        return;
      }
      if (key.name === "g") {
        if (lastKeyRef.current === "g") {
          pluginsScrollboxRef.current?.scrollTo(0);
          lastKeyRef.current = null;
        } else {
          lastKeyRef.current = "g";
        }
        return;
      }
    }

    lastKeyRef.current = null;
  });

  const levelColors: Record<LogLevel, string> = {
    debug: colors.textSubtle,
    info: colors.info,
    warn: colors.warning,
    error: colors.error,
  };

  const levelLabels: Record<LogLevel, string> = {
    debug: "DBG",
    info: "INF",
    warn: "WRN",
    error: "ERR",
  };

  return (
    <ModalBackdrop zIndex={Z_INDEX.MODAL}>
      <box
        width={width}
        height={height}
        border
        borderStyle="double"
        borderColor={colors.warning}
        flexDirection="column"
        backgroundColor={colors.background}
        overflow="hidden"
      >
        <box
          flexDirection="row"
          justifyContent="space-between"
          paddingX={1}
          backgroundColor={colors.foreground}
          height={1}
          flexShrink={0}
        >
          <box flexDirection="row" gap={2}>
            <text
              fg={activeTab === "logs" ? colors.background : colors.textMuted}
              {...(activeTab === "logs" ? { bg: colors.primary } : {})}
            >
              {" LOGS "}
            </text>
            <text
              fg={activeTab === "inspector" ? colors.background : colors.textMuted}
              {...(activeTab === "inspector" ? { bg: colors.primary } : {})}
            >
              {" INSPECTOR "}
            </text>
            <text
              fg={activeTab === "plugins" ? colors.background : colors.textMuted}
              {...(activeTab === "plugins" ? { bg: colors.primary } : {})}
            >
              {" PLUGINS "}
            </text>
          </box>
          <text fg={colors.textSubtle}>1/2/3:switch Esc:close</text>
        </box>

        {activeTab === "logs" && (
          <LogsTab
            logs={filterByLevel(logs, minLevel)}
            follow={follow}
            scrollboxRef={scrollboxRef}
            levelColors={levelColors}
            levelLabels={levelLabels}
            colors={colors}
          />
        )}

        {activeTab === "inspector" && (
          <InspectorTab data={inspectorData} colors={colors} scrollboxRef={inspectorScrollboxRef} />
        )}

        {activeTab === "plugins" && (
          <PluginsTab colors={colors} scrollboxRef={pluginsScrollboxRef} sortBy={pluginSort} />
        )}

        <box
          flexDirection="row"
          paddingX={1}
          backgroundColor={colors.foreground}
          height={1}
          flexShrink={0}
        >
          {activeTab === "logs" && (
            <text fg={colors.textSubtle}>
              j/k:scroll f:follow{follow ? "(on)" : "(off)"} l:{minLevel.toUpperCase()} c:clear
              gg:top G:bottom
            </text>
          )}
          {activeTab === "inspector" && (
            <text fg={colors.textSubtle}>j/k:scroll gg:top G:bottom</text>
          )}
          {activeTab === "plugins" && (
            <text fg={colors.textSubtle}>j/k:scroll s:sort({pluginSort}) gg:top G:bottom</text>
          )}
        </box>
      </box>
    </ModalBackdrop>
  );
}

interface LogsTabProps {
  logs: LogEntry[];
  follow: boolean;
  scrollboxRef: React.RefObject<ScrollBoxRenderable | null>;
  levelColors: Record<LogLevel, string>;
  levelLabels: Record<LogLevel, string>;
  colors: ReturnType<typeof useColors>;
}

function LogsTab({ logs, follow, scrollboxRef, levelColors, levelLabels, colors }: LogsTabProps) {
  const frozenLogsRef = useRef<LogEntry[] | null>(null);
  const frozenAtCountRef = useRef(0);

  if (follow) {
    frozenLogsRef.current = null;
    frozenAtCountRef.current = 0;
  } else if (frozenLogsRef.current === null) {
    frozenLogsRef.current = logs.slice(-200);
    frozenAtCountRef.current = logs.length;
  }

  const visibleLogs = frozenLogsRef.current ?? logs.slice(-200);
  const pendingCount = frozenLogsRef.current
    ? Math.max(0, logs.length - frozenAtCountRef.current)
    : 0;

  return (
    <box flexDirection="column" flexGrow={1} overflow="hidden">
      <box paddingLeft={1} height={1} flexShrink={0}>
        <text fg={colors.textMuted}>
          {logs.length} entries
          {follow ? " [FOLLOW]" : ` [PAUSED${pendingCount > 0 ? ` +${pendingCount} new` : ""}]`}
        </text>
      </box>
      <scrollbox
        ref={scrollboxRef}
        focused
        flexGrow={1}
        style={{
          rootOptions: { backgroundColor: colors.background },
          viewportOptions: { backgroundColor: colors.background },
          scrollbarOptions: {
            trackOptions: {
              foregroundColor: colors.textSubtle,
              backgroundColor: colors.background,
            },
          },
        }}
      >
        <box flexDirection="column" padding={1}>
          {visibleLogs.length === 0 ? (
            <text fg={colors.textSubtle}>No logs yet.</text>
          ) : (
            visibleLogs.map((entry) => (
              <LogLine
                key={entry.id}
                entry={entry}
                levelColors={levelColors}
                levelLabels={levelLabels}
                colors={colors}
              />
            ))
          )}
        </box>
      </scrollbox>
    </box>
  );
}

interface LogLineProps {
  entry: LogEntry;
  levelColors: Record<LogLevel, string>;
  levelLabels: Record<LogLevel, string>;
  colors: ReturnType<typeof useColors>;
}

function LogLine({ entry, levelColors, levelLabels, colors }: LogLineProps) {
  const time = new Date(entry.timestamp).toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const levelColor = levelColors[entry.level];
  const levelLabel = levelLabels[entry.level];
  const source = entry.source ? `[${entry.source}]` : "";
  const dataStr = entry.data ? ` ${JSON.stringify(entry.data)}` : "";

  return (
    <text height={1}>
      <span fg={colors.textSubtle}>{time}</span> <span fg={levelColor}>{levelLabel}</span>{" "}
      {source && <span fg={colors.textMuted}>{source} </span>}
      <span fg={colors.text}>{entry.message}</span>
      {dataStr && <span fg={colors.textSubtle}>{dataStr}</span>}
    </text>
  );
}

interface InspectorTabProps {
  data: DebugInspectorData | undefined;
  colors: ReturnType<typeof useColors>;
  scrollboxRef: React.RefObject<ScrollBoxRenderable | null>;
}

function InspectorTab({ data, colors, scrollboxRef }: InspectorTabProps) {
  const { height: termHeight } = useTerminalDimensions();
  const isCompact = termHeight < 30;

  if (!data) {
    return (
      <box flexGrow={1} justifyContent="center" alignItems="center">
        <text fg={colors.textMuted}>Inspector data not available</text>
      </box>
    );
  }

  const { sessions, debugData, activity, sparkData } = data;
  const totalTokens = sessions.reduce((sum, s) => sum + s.totals.input + s.totals.output, 0);
  const activeSessions = sessions.filter((s) => s.status === "active");
  const now = Date.now();

  if (isCompact) {
    return (
      <box flexDirection="column" flexGrow={1} paddingX={1} overflow="hidden">
        <box flexDirection="row" height={1} gap={2} flexShrink={0}>
          <text fg={colors.textMuted}>rate:{(activity.instantRate || 0).toFixed(0)}/s</text>
          <text fg={colors.textMuted}>avg:{(activity.avgRate || 0).toFixed(0)}/s</text>
          <text fg={colors.textMuted}>tokens:{totalTokens.toLocaleString()}</text>
          <text fg={activity.isSpike ? colors.warning : colors.textMuted}>
            {activity.isSpike ? "SPIKE" : ""}
          </text>
        </box>
        <box flexDirection="row" marginTop={1} height={1}>
          <text width={18} fg={colors.textSubtle}>
            {padRight("SESSION", 18)}
          </text>
          <text width={10} fg={colors.textSubtle}>
            {padRight("AGENT", 10)}
          </text>
          <text width={8} fg={colors.textSubtle}>
            {padRight("STATUS", 8)}
          </text>
          <text width={10} fg={colors.textSubtle}>
            {padRight("TOKENS", 10)}
          </text>
        </box>
        <scrollbox ref={scrollboxRef} flexGrow={1}>
          {sessions.slice(0, 15).map((s) => (
            <box key={s.sessionId} flexDirection="row" height={1}>
              <text width={18} fg={colors.text}>
                {padRight(s.sessionId.slice(0, 17), 18)}
              </text>
              <text width={10} fg={colors.text}>
                {padRight(s.agentName.slice(0, 9), 10)}
              </text>
              <text width={8} fg={s.status === "active" ? colors.success : colors.textMuted}>
                {padRight(s.status.slice(0, 7), 8)}
              </text>
              <text width={10} fg={colors.text}>
                {padRight((s.totals.input + s.totals.output).toLocaleString(), 10)}
              </text>
            </box>
          ))}
        </scrollbox>
      </box>
    );
  }

  return (
    <box flexDirection="column" flexGrow={1} padding={1} overflow="hidden">
      <box flexDirection="row" gap={2} height={8} flexShrink={0}>
        <box
          flexDirection="column"
          flexGrow={1}
          border
          borderColor={colors.border}
          padding={1}
          overflow="hidden"
        >
          <text height={1} fg={colors.primary}>
            {padRight("Bucket Data", 30)}
          </text>
          <text height={1} fg={colors.textMuted}>
            {padRight("deltaTokens: " + debugData.lastDeltaTokens.toLocaleString(), 30)}
          </text>
          <text height={1} fg={colors.textMuted}>
            {padRight("dt:          " + debugData.lastDt.toFixed(3) + "s", 30)}
          </text>
          <text height={1} fg={colors.textMuted}>
            {padRight("shifted:     " + debugData.bucketsShifted, 30)}
          </text>
          <text height={1} fg={colors.textMuted}>
            {padRight("currBucket:  " + debugData.currentBucketValue.toFixed(1), 30)}
          </text>
          <text height={1} fg={colors.textMuted}>
            {padRight(
              "buckets[5]:  [" +
                sparkData
                  .slice(-5)
                  .map((v) => v.toFixed(0))
                  .join(",") +
                "]",
              30,
            )}
          </text>
        </box>

        <box
          flexDirection="column"
          flexGrow={1}
          border
          borderColor={colors.border}
          padding={1}
          overflow="hidden"
        >
          <text height={1} fg={colors.primary}>
            {padRight("Activity State", 30)}
          </text>
          <text height={1} fg={colors.textMuted}>
            {padRight("instantRate: " + (activity.instantRate || 0).toFixed(1) + "/s", 30)}
          </text>
          <text height={1} fg={colors.textMuted}>
            {padRight("avgRate:     " + (activity.avgRate || 0).toFixed(1) + "/s", 30)}
          </text>
          <text height={1} fg={colors.textMuted}>
            {padRight("isSpike:     " + (activity.isSpike ? "YES" : "no"), 30)}
          </text>
        </box>

        <box
          flexDirection="column"
          flexGrow={1}
          border
          borderColor={colors.border}
          padding={1}
          overflow="hidden"
        >
          <text height={1} fg={colors.primary}>
            {padRight("Refresh Stats", 30)}
          </text>
          <text height={1} fg={colors.textMuted}>
            {padRight("count:  " + String(debugData.refreshCount), 30)}
          </text>
          <text height={1} fg={colors.textMuted}>
            {padRight("last:   " + new Date(debugData.lastRefreshTime).toLocaleTimeString(), 30)}
          </text>
          <text height={1} fg={colors.textMuted}>
            {padRight("age:    " + ((now - debugData.lastRefreshTime) / 1000).toFixed(1) + "s", 30)}
          </text>
          <text height={1} fg={colors.textMuted}>
            {padRight("tokens: " + totalTokens.toLocaleString(), 30)}
          </text>
        </box>
      </box>

      <box
        flexDirection="column"
        flexGrow={1}
        marginTop={1}
        border
        borderColor={colors.border}
        padding={1}
        overflow="hidden"
      >
        <text height={1} fg={colors.primary}>
          <strong>
            Sessions ({sessions.length} total, {activeSessions.length} active)
          </strong>
        </text>
        <box flexDirection="row" marginTop={1} height={1}>
          <text width={22} fg={colors.textSubtle}>
            {padRight("SESSION ID", 22)}
          </text>
          <text width={12} fg={colors.textSubtle}>
            {padRight("AGENT", 12)}
          </text>
          <text width={10} fg={colors.textSubtle}>
            {padRight("STATUS", 10)}
          </text>
          <text width={12} fg={colors.textSubtle}>
            {padRight("TOKENS", 12)}
          </text>
          <text width={10} fg={colors.textSubtle}>
            {padRight("AGE", 10)}
          </text>
        </box>
        <scrollbox ref={scrollboxRef} flexGrow={1}>
          {sessions.slice(0, 15).map((s) => {
            const age = now - s.lastActivityAt;
            const ageStr =
              age < 60000 ? `${(age / 1000).toFixed(0)}s` : `${(age / 60000).toFixed(1)}m`;
            return (
              <box key={s.sessionId} flexDirection="row" height={1}>
                <text width={22} fg={colors.text}>
                  {padRight(s.sessionId.slice(0, 21), 22)}
                </text>
                <text width={12} fg={colors.text}>
                  {padRight(s.agentName, 12)}
                </text>
                <text width={10} fg={s.status === "active" ? colors.success : colors.textMuted}>
                  {padRight(s.status, 10)}
                </text>
                <text width={12} fg={colors.text}>
                  {padRight((s.totals.input + s.totals.output).toLocaleString(), 12)}
                </text>
                <text width={10} fg={age < 120000 ? colors.success : colors.textMuted}>
                  {padRight(ageStr, 10)}
                </text>
              </box>
            );
          })}
        </scrollbox>
      </box>
    </box>
  );
}

interface PluginsTabProps {
  colors: ReturnType<typeof useColors>;
  scrollboxRef: React.RefObject<ScrollBoxRenderable | null>;
  sortBy: PluginSort;
}

const TYPE_ORDER: Record<string, number> = { provider: 0, agent: 1, theme: 2, notification: 3 };

function getSourcePriority(pluginId: string, pluginType: string): number {
  const source = pluginRegistry.getSource(
    pluginType as "provider" | "agent" | "theme" | "notification",
    pluginId,
  );
  return source === "local" ? 0 : source === "npm" ? 1 : 2;
}

function PluginsTab({ colors, scrollboxRef, sortBy }: PluginsTabProps) {
  const allPlugins = useMemo(() => {
    const plugins = pluginRegistry.getAllPlugins();
    return [...plugins].sort((a, b) => {
      if (sortBy === "name") {
        return a.name.localeCompare(b.name);
      }
      if (sortBy === "source") {
        const aPriority = getSourcePriority(a.id, a.type);
        const bPriority = getSourcePriority(b.id, b.type);
        if (aPriority !== bPriority) return aPriority - bPriority;
        return a.name.localeCompare(b.name);
      }
      const typeA = TYPE_ORDER[a.type] ?? 99;
      const typeB = TYPE_ORDER[b.type] ?? 99;
      if (typeA !== typeB) return typeA - typeB;
      return a.name.localeCompare(b.name);
    });
  }, [sortBy]);

  const [updates, setUpdates] = useState<Map<string, PluginUpdateInfo>>(new Map());

  useEffect(() => {
    const npmPlugins = allPlugins.filter((p) => pluginRegistry.getSource(p.type, p.id) === "npm");
    if (npmPlugins.length === 0) return;

    checkAllPluginUpdates(
      npmPlugins.map((p) => ({ id: p.id, type: p.type, version: p.version })),
    ).then(setUpdates);
  }, [allPlugins]);

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of allPlugins) {
      counts[p.type] = (counts[p.type] ?? 0) + 1;
    }
    return counts;
  }, [allPlugins]);

  const typeColors: Record<string, string> = {
    provider: colors.info,
    agent: colors.success,
    theme: colors.warning,
    notification: colors.primary,
  };

  const summary = Object.entries(typeCounts)
    .map(([type, count]) => `${count} ${type}${count !== 1 ? "s" : ""}`)
    .join(", ");

  const updatesAvailable = [...updates.values()].filter((u) => u.hasUpdate).length;

  return (
    <box flexDirection="column" flexGrow={1} overflow="hidden">
      <box paddingLeft={1} height={1} flexShrink={0}>
        <text fg={colors.textMuted}>
          {allPlugins.length} plugins ({summary})
          {updatesAvailable > 0
            ? ` · ${updatesAvailable} update${updatesAvailable !== 1 ? "s" : ""} available`
            : ""}
        </text>
      </box>
      <box flexDirection="row" paddingX={1} height={1} flexShrink={0}>
        <text width={22} fg={colors.textSubtle}>
          {padRight("PLUGIN", 22)}
        </text>
        <text width={14} fg={colors.textSubtle}>
          {padRight("TYPE", 14)}
        </text>
        <text width={10} fg={colors.textSubtle}>
          {padRight("SOURCE", 10)}
        </text>
        <text width={14} fg={colors.textSubtle}>
          {padRight("VERSION", 14)}
        </text>
        <text fg={colors.textSubtle}>DESCRIPTION</text>
      </box>
      <scrollbox ref={scrollboxRef} flexGrow={1}>
        <box flexDirection="column" paddingX={1}>
          {allPlugins.map((plugin) => {
            const key = `${plugin.type}-${plugin.id}`;
            const updateInfo = updates.get(key);
            const source = pluginRegistry.getSource(plugin.type, plugin.id) ?? "builtin";
            const official = pluginRegistry.isOfficial(plugin.type, plugin.id);

            const sourceColors: Record<string, string> = {
              builtin: colors.textSubtle,
              local: colors.success,
              npm: colors.info,
            };

            let versionSuffix = "";
            let versionColor = colors.textMuted;
            if (updateInfo?.hasUpdate && updateInfo.latestVersion) {
              versionSuffix = " ↑";
              versionColor = colors.warning;
            } else if (updateInfo && !updateInfo.hasUpdate && updateInfo.latestVersion) {
              versionSuffix = " ✓";
              versionColor = colors.success;
            }

            return (
              <box key={key} flexDirection="row" height={1}>
                <text width={22}>
                  {official && <span fg={colors.warning}>✦ </span>}
                  <span fg={colors.text}>{padRight(plugin.name, official ? 20 : 22)}</span>
                </text>
                <text width={14} fg={typeColors[plugin.type] ?? colors.textMuted}>
                  {padRight(plugin.type, 14)}
                </text>
                <text width={10} fg={sourceColors[source] ?? colors.textMuted}>
                  {padRight(source, 10)}
                </text>
                <text width={14} fg={versionColor}>
                  {padRight(plugin.version + versionSuffix, 14)}
                </text>
                <text fg={colors.textSubtle}>{plugin.meta?.description ?? ""}</text>
              </box>
            );
          })}
        </box>
      </scrollbox>
    </box>
  );
}
