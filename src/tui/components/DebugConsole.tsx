import type { ScrollBoxRenderable } from "@opentui/core";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { copyToClipboard } from "@/utils/clipboard.ts";
import { type LogEntry, type LogLevel, useLogs } from "../contexts/LogContext.tsx";
import { useColors } from "../contexts/ThemeContext.tsx";

interface DebugConsoleProps {
  height?: number;
  follow?: boolean;
  minLevel?: LogLevel;
}

export interface DebugConsoleHandle {
  scrollToTop: () => void;
  scrollToBottom: () => void;
}

const LOG_LEVEL_RANK: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

export const DebugConsole = forwardRef<DebugConsoleHandle, DebugConsoleProps>(function DebugConsole(
  { height = 15, follow = true, minLevel = "info" },
  ref,
) {
  const colors = useColors();
  const { logs } = useLogs();
  const scrollboxRef = useRef<ScrollBoxRenderable>(null);

  useImperativeHandle(ref, () => ({
    scrollToTop: () => {
      scrollboxRef.current?.scrollTo(0);
    },
    scrollToBottom: () => {
      const scrollbox = scrollboxRef.current;
      if (scrollbox) {
        scrollbox.scrollTo(scrollbox.scrollHeight);
      }
    },
  }));

  useEffect(() => {
    if (follow) {
      const scrollbox = scrollboxRef.current;
      if (scrollbox) {
        scrollbox.scrollTo(scrollbox.scrollHeight);
      }
    }
  }, [logs.length, follow]);

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

  const minRank = LOG_LEVEL_RANK[minLevel];
  const filtered = minRank === 0 ? logs : logs.filter((e) => LOG_LEVEL_RANK[e.level] >= minRank);
  const visibleLogs = filtered.slice(-50);

  return (
    <box
      flexDirection="column"
      height={height}
      borderStyle="single"
      borderColor={colors.border}
      backgroundColor={colors.background}
    >
      <box
        flexDirection="row"
        justifyContent="space-between"
        paddingX={1}
        backgroundColor={colors.foreground}
        height={1}
        flexShrink={0}
      >
        <text>
          <span fg={colors.primary}>
            <strong>Debug Console</strong>
          </span>
          <span fg={colors.textMuted}> ({logs.length} entries)</span>
          {follow && <span fg={colors.success}> [FOLLOW]</span>}
        </text>
        <text fg={colors.textSubtle}>~:close f:follow c:clear G:bottom gg:top</text>
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
            <text fg={colors.textSubtle}>No logs yet. Actions will appear here.</text>
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
});

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
    <text>
      <span fg={colors.textSubtle}>{time}</span> <span fg={levelColor}>{levelLabel}</span>{" "}
      {source && <span fg={colors.textMuted}>{source} </span>}
      <span fg={colors.text}>{entry.message}</span>
      {dataStr && <span fg={colors.textSubtle}>{dataStr}</span>}
    </text>
  );
}

export async function copyLogsToClipboard(logs: LogEntry[]): Promise<void> {
  const lines = logs.map((entry) => {
    const time = new Date(entry.timestamp).toISOString();
    const src = entry.source ? `[${entry.source}]` : "";
    const dataStr = entry.data ? ` ${JSON.stringify(entry.data)}` : "";
    return `${time} ${entry.level.toUpperCase().padEnd(5)} ${src} ${entry.message}${dataStr}`;
  });
  await copyToClipboard(lines.join("\n"));
}
