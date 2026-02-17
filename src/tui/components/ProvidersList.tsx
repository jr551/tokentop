import { useMemo } from 'react';
import { useTerminalDimensions } from '@opentui/react';
import { useColors } from '../contexts/ThemeContext.tsx';
import type { ProviderState } from '../contexts/PluginContext.tsx';
import { InlineGauge } from './InlineGauge.tsx';
import { InlineSparkline } from './InlineSparkline.tsx';

type FieldState = 'actual' | 'estimated' | 'unavailable';

interface FieldValue {
  text: string;
  state: FieldState;
}

function pad(str: string, len: number): string {
  return str.length >= len ? str.slice(0, len) : str + ' '.repeat(len - str.length);
}

function padStart(str: string, len: number): string {
  return str.length >= len ? str.slice(0, len) : ' '.repeat(len - str.length) + str;
}

function formatTokens(val: number | undefined | null): FieldValue {
  if (val === undefined || val === null) return { text: '—', state: 'unavailable' };
  const formatted = val >= 1_000_000 ? `${(val / 1_000_000).toFixed(1)}M` :
                    val >= 1_000 ? `${(val / 1_000).toFixed(1)}K` :
                    String(Math.round(val));
  return { text: formatted, state: 'actual' };
}

type StatusGroup = 'error' | 'warn' | 'ok';

function getStatusInfo(state: ProviderState, colors: ReturnType<typeof useColors>): {
  icon: string;
  color: string;
  group: StatusGroup;
} {
  if (state.usage?.error) {
    return { icon: '✗', color: colors.error, group: 'error' };
  }
  if (state.usage?.limitReached) {
    return { icon: '⚠', color: colors.warning, group: 'warn' };
  }
  const maxUsage = getMaxUsage(state);
  if (maxUsage >= 80) {
    return { icon: '!', color: colors.warning, group: 'warn' };
  }
  if (state.loading) {
    return { icon: '◌', color: colors.info, group: 'ok' };
  }
  return { icon: '●', color: colors.success, group: 'ok' };
}

function getMaxUsage(state: ProviderState): number {
  if (!state.usage?.limits) return 0;
  const items = state.usage.limits.items ?? [];
  if (items.length > 0) {
    return Math.max(...items.map((item) => item.usedPercent ?? 0));
  }
  const primary = state.usage.limits.primary?.usedPercent || 0;
  const secondary = state.usage.limits.secondary?.usedPercent || 0;
  return Math.max(primary, secondary);
}

function getNextReset(state: ProviderState): string {
  if (!state.usage?.limits) return '—';

  const items = state.usage.limits.items ?? [];
  let resetsAt: Date | null = null;

  if (items.length > 0) {
    const withReset = items.filter(i => i.resetsAt);
    if (withReset.length > 0) {
      resetsAt = new Date(Math.min(...withReset.map(i => new Date(i.resetsAt!).getTime())));
    }
  } else if (state.usage.limits.primary?.resetsAt) {
    resetsAt = new Date(state.usage.limits.primary.resetsAt);
  }

  if (!resetsAt) return '—';

  const now = Date.now();
  const diff = resetsAt.getTime() - now;
  if (diff <= 0) return 'now';

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }
  return `${hours}h ${mins}m`;
}

function getCostToday(state: ProviderState): FieldValue {
  if (!state.usage?.cost) return { text: '—', state: 'unavailable' };
  const cost = state.usage.cost;
  if (cost.actual) {
    return { text: `$${cost.actual.total.toFixed(2)}`, state: 'actual' };
  }
  if (cost.estimated) {
    return { text: `~$${cost.estimated.total.toFixed(2)}`, state: 'estimated' };
  }
  return { text: '—', state: 'unavailable' };
}

function getCostMtd(state: ProviderState): FieldValue {
  if (!state.usage?.cost) return { text: '—', state: 'unavailable' };
  const cost = state.usage.cost;
  if (cost.actual) {
    return { text: `$${cost.actual.total.toFixed(2)}`, state: 'actual' };
  }
  if (cost.estimated) {
    return { text: `~$${cost.estimated.total.toFixed(2)}`, state: 'estimated' };
  }
  return { text: '—', state: 'unavailable' };
}

function getTotalTokens(state: ProviderState): FieldValue {
  if (!state.usage?.tokens) return { text: '—', state: 'unavailable' };
  const t = state.usage.tokens;
  const total = t.input + t.output + (t.cacheRead ?? 0) + (t.cacheWrite ?? 0);
  return formatTokens(total);
}

interface GroupedProvider {
  state: ProviderState;
  status: ReturnType<typeof getStatusInfo>;
  originalIndex: number;
}

export interface ProvidersListProps {
  providers: ProviderState[];
  selectedIndex: number | null;
  onSelect: (index: number) => void;
  expandedIndex: number | null;
}

export function ProvidersList({ providers, selectedIndex, onSelect, expandedIndex: _expandedIndex }: ProvidersListProps) {
  const colors = useColors();
  const { width: termWidth } = useTerminalDimensions();

  const isNarrow = termWidth < 80;

  const gaugeWidth = isNarrow ? 12 : 20;
  const sparkWidth = isNarrow ? 5 : 8;
  const nameWidth = isNarrow ? 12 : 16;

  const showMtd = !isNarrow;
  const showPlan = !isNarrow;
  const showTrend = !isNarrow;

  const grouped = useMemo(() => {
    const groups: Record<StatusGroup, GroupedProvider[]> = { error: [], warn: [], ok: [] };

    providers.forEach((state, idx) => {
      const status = getStatusInfo(state, colors);
      groups[status.group].push({ state, status, originalIndex: idx });
    });

    return groups;
  }, [providers, colors]);

  const groupOrder: StatusGroup[] = ['error', 'warn', 'ok'];

  const fieldColor = (fv: FieldValue, isSelected: boolean): string => {
    if (isSelected) return colors.background;
    if (fv.state === 'estimated') return colors.textMuted;
    if (fv.state === 'unavailable') return colors.textSubtle;
    return colors.text;
  };

  const renderRow = (item: GroupedProvider) => {
    const { state, status, originalIndex } = item;
    const isSelected = originalIndex === selectedIndex;
    const providerColor = state.plugin.meta?.brandColor ?? colors.primary;
    const costToday = getCostToday(state);
    const costMtd = getCostMtd(state);
    const tokens = getTotalTokens(state);
    const maxUsage = getMaxUsage(state);
    const plan = state.usage?.planType ?? '—';
    const reset = getNextReset(state);

    return (
      <box
        key={state.plugin.id}
        flexDirection="row"
        paddingX={1}
        height={1}
        focusable
        onMouseDown={() => onSelect(originalIndex)}
        {...(isSelected ? { backgroundColor: colors.primary } : {})}
      >
        <text width={3} fg={isSelected ? colors.background : status.color} height={1}>
          {pad(`${status.icon} `, 3)}
        </text>
        <text width={nameWidth} fg={isSelected ? colors.background : providerColor} height={1}>
          {pad(state.plugin.name, nameWidth)}
        </text>
        {showPlan && (
          <text width={8} fg={isSelected ? colors.background : colors.textMuted} height={1}>
            {pad(plan, 8)}
          </text>
        )}
        <box width={gaugeWidth + 5} flexDirection="row" height={1}>
          {isSelected ? (
            <text width={gaugeWidth + 5} fg={colors.background} height={1}>
              {pad(
                '█'.repeat(Math.round((maxUsage / 100) * gaugeWidth)) +
                '·'.repeat(gaugeWidth - Math.round((maxUsage / 100) * gaugeWidth)) +
                ' ' + (maxUsage > 0 ? `${Math.round(maxUsage)}%` : '—'),
                gaugeWidth + 5,
              )}
            </text>
          ) : (
            <>
              <InlineGauge percent={maxUsage > 0 ? maxUsage : null} width={gaugeWidth} color={providerColor} />
              <text width={5} fg={maxUsage >= 80 ? colors.warning : colors.text} height={1}>
                {padStart(maxUsage > 0 ? `${Math.round(maxUsage)}%` : '—', 5)}
              </text>
            </>
          )}
        </box>
        <text width={9} fg={fieldColor(costToday, isSelected)} height={1}>
          {padStart(costToday.text, 9)}
        </text>
        {showMtd && (
          <text width={9} fg={fieldColor(costMtd, isSelected)} height={1}>
            {padStart(costMtd.text, 9)}
          </text>
        )}
        <text width={8} fg={fieldColor(tokens, isSelected)} height={1}>
          {padStart(tokens.text, 8)}
        </text>
        <text width={9} fg={isSelected ? colors.background : colors.textMuted} height={1}>
          {padStart(reset, 9)}
        </text>
        {showTrend && (
          <box width={sparkWidth} height={1}>
            {isSelected ? (
              <text width={sparkWidth} fg={colors.background} height={1}>
                {'⣀'.repeat(sparkWidth)}
              </text>
            ) : (
              <InlineSparkline history={state.history} width={sparkWidth} />
            )}
          </box>
        )}
      </box>
    );
  };

  const renderSeparator = (label: string) => (
    <box height={1} paddingX={1} key={`sep-${label}`}>
      <text fg={colors.textSubtle} height={1}>
        {'─'.repeat(3)} {label} {'─'.repeat(Math.max(0, termWidth - label.length - 10))}
      </text>
    </box>
  );

  const renderHeader = () => (
    <box flexDirection="row" paddingX={1} height={1}>
      <text width={3} fg={colors.textMuted} height={1}>{pad('', 3)}</text>
      <text width={nameWidth} fg={colors.textMuted} height={1}>{pad('PROVIDER', nameWidth)}</text>
      {showPlan && <text width={8} fg={colors.textMuted} height={1}>{pad('PLAN', 8)}</text>}
      <text width={gaugeWidth + 5} fg={colors.textMuted} height={1}>{pad('HEADROOM', gaugeWidth + 5)}</text>
      <text width={9} fg={colors.textMuted} height={1}>{padStart('$TODAY', 9)}</text>
      {showMtd && <text width={9} fg={colors.textMuted} height={1}>{padStart('$MTD', 9)}</text>}
      <text width={8} fg={colors.textMuted} height={1}>{padStart('TOKENS', 8)}</text>
      <text width={9} fg={colors.textMuted} height={1}>{padStart('RESET', 9)}</text>
      {showTrend && <text width={sparkWidth} fg={colors.textMuted} height={1}>{pad('TREND', sparkWidth)}</text>}
    </box>
  );

  const rows: JSX.Element[] = [];
  let isFirst = true;

  for (const group of groupOrder) {
    const items = grouped[group];
    if (items.length === 0) continue;

    if (!isFirst) {
      const label = group === 'error' ? 'ERRORS' : group === 'warn' ? 'WARNINGS' : 'OK';
      rows.push(renderSeparator(label));
    } else if (group !== 'ok' && items.length > 0) {
      const label = group === 'error' ? 'ERRORS' : 'WARNINGS';
      rows.push(renderSeparator(label));
    }

    for (const item of items) {
      rows.push(renderRow(item));
    }

    isFirst = false;
  }

  return (
    <box flexDirection="column" flexGrow={1}>
      {renderHeader()}
      <scrollbox flexGrow={1}>
        <box flexDirection="column">
          {rows}
        </box>
      </scrollbox>
    </box>
  );
}
