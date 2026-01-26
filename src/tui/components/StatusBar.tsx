import { useState, useEffect } from 'react';
import { useTerminalDimensions } from '@opentui/react';
import { useColors } from '../contexts/ThemeContext.tsx';

interface StatusBarProps {
  lastRefresh?: number;
  nextRefresh?: number;
  message?: string;
  demoMode?: boolean;
}

export function StatusBar({ lastRefresh, nextRefresh, message, demoMode = false }: StatusBarProps) {
  const colors = useColors();
  const { width: termWidth } = useTerminalDimensions();
  const [, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setTick((t) => t + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const isNarrow = termWidth < 100;

  const lastRefreshText = lastRefresh
    ? (isNarrow ? formatTimeShort(lastRefresh) : `Last: ${formatTime(lastRefresh)}`)
    : '';

  const nextRefreshText = nextRefresh
    ? `${formatCountdown(nextRefresh)}`
    : '';

  const hints = isNarrow ? '? help' : '1-4 views  , settings  : cmd  ? help';

  return (
    <box
      flexDirection="row"
      justifyContent="space-between"
      paddingLeft={1}
      paddingRight={1}
      backgroundColor={colors.foreground}
      flexShrink={0}
      height={1}
      overflow="hidden"
    >
      <text fg={colors.textMuted}>
        {demoMode ? 'tokentop DEMO' : (message ?? 'tokentop')}
      </text>
      <box flexDirection="row" gap={1} overflow="hidden">
        <text fg={colors.textSubtle}>{hints}</text>
        {lastRefreshText && <text fg={colors.textSubtle}>{lastRefreshText}</text>}
        {nextRefreshText && <text fg={colors.textSubtle}>{nextRefreshText}</text>}
      </box>
    </box>
  );
}

function formatTimeShort(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function formatCountdown(timestamp: number): string {
  const now = Date.now();
  const diff = timestamp - now;

  if (diff <= 0) return 'now';

  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s`;

  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}
