import { useState, useMemo, useEffect } from 'react';
import { useKeyboard, useTerminalDimensions } from '@opentui/react';
import { useColors } from '../contexts/ThemeContext.tsx';
import { useStorageReady } from '../contexts/StorageContext.tsx';
import { useDemoMode } from '../contexts/DemoModeContext.tsx';
import { queryUsageTimeSeries, queryProviderDailyCosts, isDatabaseInitialized } from '@/storage/index.ts';

// ============================================================================
// Types
// ============================================================================

type TimePeriod = '7d' | '30d' | '90d';
type MetricType = 'cost' | 'tokens' | 'requests';
type BreakdownDimension = 'provider' | 'model' | 'project' | 'off';

interface ChartPoint {
  label: string;
  dayName: string;
  costUsd: number;
  tokens: number;
  requestCount: number;
}

interface ProviderContribution {
  provider: string;
  cost: number;
  costShare: number;
  tokens: number;
  requests: number;
  dailyCosts: number[];
}

interface PeriodSummary {
  totalCost: number;
  avgPerDay: number;
  peakDay: { label: string; value: number } | null;
  lowDay: { label: string; value: number } | null;
  totalRequests: number;
  totalTokens: number;
}

// ============================================================================
// Constants
// ============================================================================

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const METRIC_LABELS: Record<MetricType, string> = {
  cost: 'COST',
  tokens: 'TOKENS',
  requests: 'REQUESTS',
};

const CHART_CHARS = {
  h: '─', v: '│', tl: '╭', tr: '╮', bl: '╰', br: '╯', cross: '┼', t_l: '┤',
};

const GHOST_CHARS = {
  h: '╌', v: '╎', tl: '╭', tr: '╮', bl: '╰', br: '╯',
};

// ============================================================================
// Formatting utilities
// ============================================================================

function fmtCurrency(val: number): string {
  if (val >= 1000) return `$${(val / 1000).toFixed(1)}k`;
  if (val >= 100) return `$${Math.round(val)}`;
  if (val >= 10) return `$${val.toFixed(1)}`;
  return `$${val.toFixed(2)}`;
}

function fmtTokens(val: number): string {
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1000) return `${(val / 1000).toFixed(1)}K`;
  return `${val}`;
}

function fmtNumber(val: number): string {
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1000) return `${(val / 1000).toFixed(1)}K`;
  return `${val}`;
}

function fmtMetricValue(val: number, metric: MetricType): string {
  switch (metric) {
    case 'cost': return fmtCurrency(val);
    case 'tokens': return fmtTokens(val);
    case 'requests': return fmtNumber(val);
  }
}

function fmtYAxisLabel(val: number, metric: MetricType): string {
  switch (metric) {
    case 'cost': return `$${Math.round(val)}`.padStart(5);
    case 'tokens': return fmtTokens(val).padStart(5);
    case 'requests': return `${Math.round(val)}`.padStart(5);
  }
}

function fmtDeltaPct(current: number, previous: number): { text: string; positive: boolean } {
  if (previous === 0) {
    return current > 0 ? { text: '▲ new', positive: false } : { text: '── 0%', positive: true };
  }
  const pct = ((current - previous) / previous) * 100;
  const sign = pct >= 0 ? '▲' : '▼';
  return { text: `${sign} ${Math.abs(pct).toFixed(0)}%`, positive: pct <= 0 };
}

function miniSparkline(values: number[], width: number): string {
  if (values.length === 0) return ' '.repeat(width);
  const max = Math.max(...values, 0.001);
  const blocks = '▁▂▃▄▅▆▇█';
  const step = Math.max(1, values.length / width);
  let result = '';
  for (let i = 0; i < width; i++) {
    const idx = Math.min(Math.floor(i * step), values.length - 1);
    const v = values[idx] ?? 0;
    const normalized = Math.min(7, Math.floor((v / max) * 8));
    result += v <= 0 ? '▁' : (blocks[normalized] ?? '▁');
  }
  return result;
}

function padRight(str: string, len: number): string {
  return str.length >= len ? str.slice(0, len) : str + ' '.repeat(len - str.length);
}

function truncate(str: string, maxLen: number): string {
  return str.length <= maxLen ? str : str.slice(0, maxLen - 1) + '…';
}

// ============================================================================
// Data helpers
// ============================================================================

function getDaysBack(period: TimePeriod): number {
  return period === '30d' ? 30 : period === '90d' ? 90 : 7;
}

function formatDateLabel(date: Date, period: TimePeriod, index: number): string {
  if (period === '7d') return date.toLocaleDateString('en-US', { weekday: 'short' });
  if (period === '30d') return index % 5 === 0 ? date.getUTCDate().toString() : '';
  return index % 15 === 0 ? `${date.getUTCMonth() + 1}/${date.getUTCDate()}` : '';
}

function getDayName(date: Date): string {
  return date.toLocaleDateString('en-US', { weekday: 'short' });
}

function getMetricValue(point: ChartPoint, metric: MetricType): number {
  switch (metric) {
    case 'cost': return point.costUsd;
    case 'tokens': return point.tokens;
    case 'requests': return point.requestCount;
  }
}

function computeSummary(points: ChartPoint[], metric: MetricType): PeriodSummary {
  const totalCost = points.reduce((sum, p) => sum + p.costUsd, 0);
  const totalTokens = points.reduce((sum, p) => sum + p.tokens, 0);
  const totalRequests = points.reduce((sum, p) => sum + p.requestCount, 0);
  const avgPerDay = points.length > 0 ? totalCost / points.length : 0;

  let peakDay: { label: string; value: number } | null = null;
  let lowDay: { label: string; value: number } | null = null;

  for (const p of points) {
    const v = getMetricValue(p, metric);
    if (!peakDay || v > peakDay.value) peakDay = { label: p.dayName || p.label, value: v };
    if (!lowDay || v < lowDay.value) lowDay = { label: p.dayName || p.label, value: v };
  }

  return { totalCost, avgPerDay, peakDay, lowDay, totalRequests, totalTokens };
}

// ============================================================================
// Data fetching — Real mode
// ============================================================================

function fetchTimeSeries(period: TimePeriod, offsetPeriods = 0): ChartPoint[] {
  if (!isDatabaseInitialized()) return [];

  const now = Date.now();
  const daysBack = getDaysBack(period);
  const endMs = now - offsetPeriods * daysBack * MS_PER_DAY;
  const startMs = endMs - daysBack * MS_PER_DAY;

  try {
    const timeSeries = queryUsageTimeSeries(startMs, endMs, MS_PER_DAY);
    const byBucket = new Map<number, { costUsd: number; tokens: number; requests: number }>();
    for (const point of timeSeries) {
      byBucket.set(point.bucketStart, {
        costUsd: point.costUsd,
        tokens: point.tokens,
        requests: point.requestCount,
      });
    }

    const points: ChartPoint[] = [];
    for (let i = daysBack - 1; i >= 0; i--) {
      const dayTs = endMs - i * MS_PER_DAY;
      const bucket = Math.floor(dayTs / MS_PER_DAY) * MS_PER_DAY;
      const data = byBucket.get(bucket);
      const d = new Date(bucket);
      points.push({
        label: formatDateLabel(d, period, i),
        dayName: getDayName(d),
        costUsd: data?.costUsd ?? 0,
        tokens: data?.tokens ?? 0,
        requestCount: data?.requests ?? 0,
      });
    }
    return points;
  } catch {
    return [];
  }
}

function fetchProviderBreakdown(period: TimePeriod): ProviderContribution[] {
  if (!isDatabaseInitialized()) return [];

  const now = Date.now();
  const daysBack = getDaysBack(period);
  const startMs = now - daysBack * MS_PER_DAY;

  try {
    const rows = queryProviderDailyCosts(startMs, now, MS_PER_DAY);

    const providerMap = new Map<string, {
      cost: number; tokens: number; requests: number;
      dailyCosts: Map<number, number>;
    }>();

    for (const row of rows) {
      const entry = providerMap.get(row.provider) ?? {
        cost: 0, tokens: 0, requests: 0, dailyCosts: new Map(),
      };
      entry.cost += row.costUsd;
      entry.tokens += row.tokens;
      entry.requests += row.requestCount;
      entry.dailyCosts.set(row.bucketStart, (entry.dailyCosts.get(row.bucketStart) ?? 0) + row.costUsd);
      providerMap.set(row.provider, entry);
    }

    const totalCost = Array.from(providerMap.values()).reduce((sum, p) => sum + p.cost, 0);

    return Array.from(providerMap.entries())
      .map(([provider, d]) => {
        const dailyCosts: number[] = [];
        for (let i = daysBack - 1; i >= 0; i--) {
          const dayTs = Date.now() - i * MS_PER_DAY;
          const bucket = Math.floor(dayTs / MS_PER_DAY) * MS_PER_DAY;
          dailyCosts.push(d.dailyCosts.get(bucket) ?? 0);
        }
        return {
          provider,
          cost: d.cost,
          costShare: totalCost > 0 ? (d.cost / totalCost) * 100 : 0,
          tokens: d.tokens,
          requests: d.requests,
          dailyCosts,
        };
      })
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 4);
  } catch {
    return [];
  }
}

// ============================================================================
// Data fetching — Demo mode
// ============================================================================

function fetchDemoTimeSeries(
  simulator: NonNullable<ReturnType<typeof useDemoMode>['simulator']>,
  period: TimePeriod,
  offsetPeriods = 0
): ChartPoint[] {
  const daysBack = getDaysBack(period);
  const totalDays = daysBack * (1 + offsetPeriods);
  const historicalData = simulator.generateHistoricalCostData(totalDays);

  const sliceEnd = historicalData.length - offsetPeriods * daysBack;
  const periodData = historicalData.slice(
    Math.max(0, sliceEnd - daysBack),
    sliceEnd
  );

  return periodData.map((item, index) => {
    const d = new Date(item.date);
    const tokens = Math.floor(item.cost * 18000);
    const requests = Math.floor(item.cost * 10);
    return {
      label: formatDateLabel(d, period, daysBack - 1 - index),
      dayName: getDayName(d),
      costUsd: item.cost,
      tokens,
      requestCount: requests,
    };
  });
}

function fetchDemoProviderBreakdown(
  simulator: NonNullable<ReturnType<typeof useDemoMode>['simulator']>,
  period: TimePeriod
): ProviderContribution[] {
  const daysBack = getDaysBack(period);
  const byProvider = simulator.generateHistoricalCostDataByProvider(daysBack);

  const providerMap = new Map<string, {
    cost: number; tokens: number; requests: number;
  }>();
  const providerDayMap = new Map<string, Map<number, number>>();

  for (const entry of byProvider) {
    if (!providerDayMap.has(entry.provider)) {
      providerDayMap.set(entry.provider, new Map());
    }
    providerDayMap.get(entry.provider)!.set(entry.date, entry.cost);

    const existing = providerMap.get(entry.provider) ?? {
      cost: 0, tokens: 0, requests: 0,
    };
    existing.cost += entry.cost;
    existing.tokens += entry.tokens;
    existing.requests += entry.requests;
    providerMap.set(entry.provider, existing);
  }

  const totalCost = Array.from(providerMap.values()).reduce((sum, p) => sum + p.cost, 0);
  const allDates = [...new Set(byProvider.map(e => e.date))].sort((a, b) => a - b);

  return Array.from(providerMap.entries())
    .map(([provider, d]) => {
      const dayMap = providerDayMap.get(provider) ?? new Map();
      const dailyCosts = allDates.map(date => dayMap.get(date) ?? 0);
      return {
        provider,
        cost: d.cost,
        costShare: totalCost > 0 ? (d.cost / totalCost) * 100 : 0,
        tokens: d.tokens,
        requests: d.requests,
        dailyCosts,
      };
    })
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 4);
}

function fetchDemoPrevContributors(
  simulator: NonNullable<ReturnType<typeof useDemoMode>['simulator']>,
  period: TimePeriod
): ProviderContribution[] {
  const daysBack = getDaysBack(period);
  const allByProvider = simulator.generateHistoricalCostDataByProvider(daysBack * 2);
  const halfLen = Math.floor(allByProvider.length / 2);
  const prevEntries = allByProvider.slice(0, halfLen);

  const providerMap = new Map<string, number>();
  for (const entry of prevEntries) {
    providerMap.set(entry.provider, (providerMap.get(entry.provider) ?? 0) + entry.cost);
  }
  const totalCost = Array.from(providerMap.values()).reduce((s, v) => s + v, 0);

  return Array.from(providerMap.entries())
    .map(([provider, cost]) => ({
      provider,
      cost,
      costShare: totalCost > 0 ? (cost / totalCost) * 100 : 0,
      tokens: Math.floor(cost * 18000),
      requests: Math.floor(cost * 10),
      dailyCosts: [],
    }))
    .sort((a, b) => b.cost - a.cost);
}

// ============================================================================
// AsciiChart component (enhanced with comparison + cursor)
// ============================================================================

type CellType = 'empty' | 'main' | 'ghost' | 'cursor';

interface AsciiChartProps {
  data: ChartPoint[];
  comparisonData?: ChartPoint[] | undefined;
  metric: MetricType;
  cursorIndex: number | null;
  height: number;
  width: number;
  color: string;
  ghostColor: string;
  cursorColor: string;
  labelColor: string;
  gridColor: string;
}

const AsciiChart = ({
  data, comparisonData, metric, cursorIndex,
  height, width, color, ghostColor, cursorColor, labelColor, gridColor,
}: AsciiChartProps) => {
  const chartHeight = height - 2;
  const yAxisWidth = 6;
  const chartWidth = width - yAxisWidth;

  if (data.length < 2 || chartHeight < 3 || chartWidth < 10) {
    return <box><text fg={labelColor}>Chart too small</text></box>;
  }

  const values = data.map(d => getMetricValue(d, metric));
  const compValues = comparisonData?.map(d => getMetricValue(d, metric)) ?? [];
  const allValues = [...values, ...compValues];
  const maxVal = Math.max(...allValues, metric === 'cost' ? 10 : 100) * 1.1;
  const minVal = 0;

  const normalize = (v: number) =>
    Math.min(chartHeight - 1, Math.max(0, Math.floor(((v - minVal) / (maxVal - minVal)) * chartHeight)));

  const gridChars: string[][] = Array.from({ length: chartHeight }, () => Array(chartWidth).fill(' '));
  const gridTypes: CellType[][] = Array.from({ length: chartHeight }, () =>
    Array<CellType>(chartWidth).fill('empty')
  );

  const plotLine = (
    vals: number[],
    chars: { h: string; v: string; tl: string; tr: string; bl: string; br: string },
    cellType: CellType
  ) => {
    if (vals.length < 2) return;
    const normalized = vals.map(normalize);
    const stepsPerPoint = chartWidth / (vals.length - 1);
    let currentX = 0;

    for (let i = 0; i < vals.length - 1; i++) {
      const y1 = normalized[i] ?? 0;
      const y2 = normalized[i + 1] ?? 0;
      const xStart = Math.round(currentX);
      const xEnd = Math.round(currentX + stepsPerPoint);
      const xMid = Math.floor((xStart + xEnd) / 2);

      for (let x = xStart; x < xMid; x++) {
        if (x < chartWidth && gridChars[y1]) {
          gridChars[y1]![x] = chars.h;
          gridTypes[y1]![x] = cellType;
        }
      }

      if (y2 > y1) {
        if (xMid < chartWidth && gridChars[y1]) { gridChars[y1]![xMid] = chars.br; gridTypes[y1]![xMid] = cellType; }
        for (let y = y1 + 1; y < y2; y++) {
          if (xMid < chartWidth && gridChars[y]) { gridChars[y]![xMid] = chars.v; gridTypes[y]![xMid] = cellType; }
        }
        if (xMid < chartWidth && gridChars[y2]) { gridChars[y2]![xMid] = chars.tl; gridTypes[y2]![xMid] = cellType; }
      } else if (y2 < y1) {
        if (xMid < chartWidth && gridChars[y1]) { gridChars[y1]![xMid] = chars.tr; gridTypes[y1]![xMid] = cellType; }
        for (let y = y1 - 1; y > y2; y--) {
          if (xMid < chartWidth && gridChars[y]) { gridChars[y]![xMid] = chars.v; gridTypes[y]![xMid] = cellType; }
        }
        if (xMid < chartWidth && gridChars[y2]) { gridChars[y2]![xMid] = chars.bl; gridTypes[y2]![xMid] = cellType; }
      } else {
        if (xMid < chartWidth && gridChars[y1]) { gridChars[y1]![xMid] = chars.h; gridTypes[y1]![xMid] = cellType; }
      }

      for (let x = xMid + 1; x < xEnd; x++) {
        if (x < chartWidth && gridChars[y2]) { gridChars[y2]![x] = chars.h; gridTypes[y2]![x] = cellType; }
      }

      currentX += stepsPerPoint;
    }

    const lastY = normalized[vals.length - 1] ?? 0;
    const lastX = Math.round(currentX);
    if (lastX < chartWidth && gridChars[lastY]) {
      gridChars[lastY]![lastX] = chars.h;
      gridTypes[lastY]![lastX] = cellType;
    }
  };

  // Plot ghost first (comparison), then main on top
  if (compValues.length >= 2) {
    plotLine(compValues, GHOST_CHARS, 'ghost');
  }
  plotLine(values, CHART_CHARS, 'main');

  // Cursor overlay
  let cursorCol: number | null = null;
  if (cursorIndex !== null && cursorIndex >= 0 && cursorIndex < data.length) {
    const stepsPerPoint = chartWidth / (data.length - 1);
    cursorCol = Math.round(cursorIndex * stepsPerPoint);
    if (cursorCol >= 0 && cursorCol < chartWidth) {
      for (let y = 0; y < chartHeight; y++) {
        if (gridTypes[y]?.[cursorCol] === 'empty') {
          gridChars[y]![cursorCol] = '┆';
          gridTypes[y]![cursorCol] = 'cursor';
        }
      }
    }
  }

  // Render rows
  const rows = [];
  for (let r = chartHeight - 1; r >= 0; r--) {
    const rowVal = minVal + (r / (chartHeight - 1)) * (maxVal - minVal);
    const showLabel = r === 0 || r === chartHeight - 1 || r === Math.floor(chartHeight / 2);
    const label = showLabel ? fmtYAxisLabel(rowVal, metric) : '     ';
    const sep = r === 0 ? CHART_CHARS.cross : CHART_CHARS.t_l;

    rows.push(
      <box key={`row-${r}`} flexDirection="row" height={1}>
        <text width={5} height={1} fg={labelColor}>{label}</text>
        <text width={1} height={1} fg={gridColor}>{sep}</text>
        <text flexGrow={1} height={1}>
          {(gridChars[r] ?? []).map((char, cx) => {
            const type = gridTypes[r]?.[cx] ?? 'empty';
            let fg: string | undefined;
            if (type === 'main') fg = color;
            else if (type === 'ghost') fg = ghostColor;
            else if (type === 'cursor') fg = cursorColor;
            return <span key={cx} {...(fg ? { fg } : {})}>{char}</span>;
          })}
        </text>
      </box>
    );
  }

  // Cursor indicator above chart
  let cursorIndicator = null;
  if (cursorIndex !== null && cursorCol !== null) {
    const cursorDay = data[cursorIndex];
    if (cursorDay) {
      const indicatorText = `▼ ${cursorDay.dayName}`;
      const padLen = Math.max(0, cursorCol + yAxisWidth - 1);
      cursorIndicator = (
        <box height={1}>
          <text height={1} fg={cursorColor}>{' '.repeat(padLen)}{indicatorText}</text>
        </box>
      );
    }
  }

  // X-axis labels
  const labelParts = data.map((d, i) => {
    if (!d.label) return '';
    if (cursorIndex === i) return `[${d.label}]`;
    return d.label;
  }).filter(l => l).join('   ').slice(0, chartWidth);

  const labelRow = (
    <box flexDirection="row" height={1} paddingLeft={yAxisWidth}>
      <text height={1} fg={labelColor}>{labelParts}</text>
    </box>
  );

  return (
    <box flexDirection="column">
      {cursorIndicator}
      {rows}
      {labelRow}
    </box>
  );
};

// ============================================================================
// InsightPanel — Period Summary
// ============================================================================

function PeriodSummarySection({ summary, metric }: { summary: PeriodSummary; metric: MetricType }) {
  const colors = useColors();

  return (
    <box flexDirection="column" paddingX={1}>
      <text fg={colors.textMuted} height={1}><strong>PERIOD SUMMARY</strong></text>
      <box flexDirection="row" justifyContent="space-between" height={1}>
        <text fg={colors.textMuted} height={1}>Total</text>
        <text fg={colors.success} height={1}><strong>{fmtCurrency(summary.totalCost)}</strong></text>
      </box>
      <box flexDirection="row" justifyContent="space-between" height={1}>
        <text fg={colors.textMuted} height={1}>Avg/day</text>
        <text fg={colors.text} height={1}>{fmtCurrency(summary.avgPerDay)}</text>
      </box>
      {summary.peakDay && (
        <box flexDirection="row" justifyContent="space-between" height={1}>
          <text fg={colors.textMuted} height={1}>Peak</text>
          <text fg={colors.warning} height={1}>{summary.peakDay.label} {fmtMetricValue(summary.peakDay.value, metric)}</text>
        </box>
      )}
      {summary.lowDay && (
        <box flexDirection="row" justifyContent="space-between" height={1}>
          <text fg={colors.textMuted} height={1}>Low</text>
          <text fg={colors.info} height={1}>{summary.lowDay.label} {fmtMetricValue(summary.lowDay.value, metric)}</text>
        </box>
      )}
      <box flexDirection="row" justifyContent="space-between" height={1}>
        <text fg={colors.textMuted} height={1}>Requests</text>
        <text fg={colors.text} height={1}>{fmtNumber(summary.totalRequests)}</text>
      </box>
      <box flexDirection="row" justifyContent="space-between" height={1}>
        <text fg={colors.textMuted} height={1}>Tokens</text>
        <text fg={colors.text} height={1}>{fmtTokens(summary.totalTokens)}</text>
      </box>
    </box>
  );
}

// ============================================================================
// InsightPanel — vs Previous Period
// ============================================================================

function DeltaSection({ current, previous }: { current: PeriodSummary; previous: PeriodSummary }) {
  const colors = useColors();
  const costDelta = fmtDeltaPct(current.totalCost, previous.totalCost);
  const tokensDelta = fmtDeltaPct(current.totalTokens, previous.totalTokens);
  const reqDelta = fmtDeltaPct(current.totalRequests, previous.totalRequests);

  return (
    <box flexDirection="column" paddingX={1}>
      <text fg={colors.textMuted} height={1}><strong>vs PREVIOUS</strong></text>
      <box flexDirection="row" justifyContent="space-between" height={1}>
        <text fg={colors.textMuted} height={1}>Cost</text>
        <text fg={costDelta.positive ? colors.success : colors.error} height={1}>{costDelta.text}</text>
      </box>
      <box flexDirection="row" justifyContent="space-between" height={1}>
        <text fg={colors.textMuted} height={1}>Tokens</text>
        <text fg={tokensDelta.positive ? colors.success : colors.error} height={1}>{tokensDelta.text}</text>
      </box>
      <box flexDirection="row" justifyContent="space-between" height={1}>
        <text fg={colors.textMuted} height={1}>Requests</text>
        <text fg={reqDelta.positive ? colors.success : colors.error} height={1}>{reqDelta.text}</text>
      </box>
    </box>
  );
}

// ============================================================================
// InsightPanel — Comparison Table (Phase 2)
// ============================================================================

function ComparisonTable({
  current, previous, currentContributors, previousContributors,
}: {
  current: PeriodSummary;
  previous: PeriodSummary;
  currentContributors: ProviderContribution[];
  previousContributors: ProviderContribution[];
}) {
  const colors = useColors();
  const costDelta = fmtDeltaPct(current.totalCost, previous.totalCost);
  const tokensDelta = fmtDeltaPct(current.totalTokens, previous.totalTokens);

  const providerDeltas: Array<{ name: string; delta: ReturnType<typeof fmtDeltaPct> }> = [];
  for (const curr of currentContributors) {
    const prev = previousContributors.find(p => p.provider === curr.provider);
    providerDeltas.push({
      name: curr.provider,
      delta: fmtDeltaPct(curr.cost, prev?.cost ?? 0),
    });
  }

  return (
    <box flexDirection="column" paddingX={1}>
      <text fg={colors.textMuted} height={1}><strong>COMPARISON</strong></text>
      <box flexDirection="row" height={1}>
        <text fg={colors.textMuted} width={10} height={1}>{padRight('', 10)}</text>
        <text fg={colors.textSubtle} width={8} height={1}>{'This'.padStart(8)}</text>
        <text fg={colors.textSubtle} width={8} height={1}>{'Prev'.padStart(8)}</text>
      </box>
      <box flexDirection="row" height={1}>
        <text fg={colors.textMuted} width={10} height={1}>{padRight('Cost', 10)}</text>
        <text fg={colors.text} width={8} height={1}>{fmtCurrency(current.totalCost).padStart(8)}</text>
        <text fg={colors.textSubtle} width={8} height={1}>{fmtCurrency(previous.totalCost).padStart(8)}</text>
      </box>
      <box flexDirection="row" height={1}>
        <text fg={colors.textMuted} width={10} height={1}>{padRight('Tokens', 10)}</text>
        <text fg={colors.text} width={8} height={1}>{fmtTokens(current.totalTokens).padStart(8)}</text>
        <text fg={colors.textSubtle} width={8} height={1}>{fmtTokens(previous.totalTokens).padStart(8)}</text>
      </box>

      <box paddingX={0} height={1}>
        <text fg={colors.border} height={1}>{'─'.repeat(26)}</text>
      </box>

      <box flexDirection="row" justifyContent="space-between" height={1}>
        <text fg={colors.textMuted} height={1}>Cost Δ</text>
        <text fg={costDelta.positive ? colors.success : colors.error} height={1}>{costDelta.text}</text>
      </box>
      <box flexDirection="row" justifyContent="space-between" height={1}>
        <text fg={colors.textMuted} height={1}>Tokens Δ</text>
        <text fg={tokensDelta.positive ? colors.success : colors.error} height={1}>{tokensDelta.text}</text>
      </box>

      {providerDeltas.length > 0 && (
        <box flexDirection="column">
          <box paddingX={0} height={1}>
            <text fg={colors.border} height={1}>{'─'.repeat(26)}</text>
          </box>
          <text fg={colors.textMuted} height={1}><strong>BIGGEST CHANGES</strong></text>
          {providerDeltas.slice(0, 3).map(pd => (
            <box key={pd.name} flexDirection="row" justifyContent="space-between" height={1}>
              <text fg={colors.text} height={1}>{truncate(pd.name, 12)}</text>
              <text fg={pd.delta.positive ? colors.success : colors.error} height={1}>{pd.delta.text}</text>
            </box>
          ))}
        </box>
      )}
    </box>
  );
}

// ============================================================================
// InsightPanel — Top Contributors
// ============================================================================

function ContributorsSection({
  contributors, breakdown, panelWidth,
}: {
  contributors: ProviderContribution[];
  breakdown: BreakdownDimension;
  panelWidth: number;
}) {
  const colors = useColors();

  if (breakdown === 'off' || contributors.length === 0) return null;

  const nameWidth = Math.max(8, panelWidth - 22);
  const sparkWidth = 7;

  return (
    <box flexDirection="column" paddingX={1}>
      <text fg={colors.textMuted} height={1}><strong>TOP CONTRIBUTORS</strong></text>
      {contributors.map((c) => (
        <box key={c.provider} flexDirection="column">
          <box flexDirection="row" height={1}>
            <text fg={colors.primary} width={nameWidth} height={1}>
              {padRight(truncate(c.provider, nameWidth), nameWidth)}
            </text>
            <text fg={colors.text} height={1}>{fmtCurrency(c.cost).padStart(7)}</text>
          </box>
          <box flexDirection="row" height={1}>
            <text fg={colors.textSubtle} height={1}>
              {padRight(`${Math.round(c.costShare)}%`, 5)}
            </text>
            <text fg={colors.accent} height={1}>
              {miniSparkline(c.dailyCosts, sparkWidth)}
            </text>
          </box>
        </box>
      ))}
    </box>
  );
}

// ============================================================================
// InsightPanel — Cursor Day Detail (Phase 3)
// ============================================================================

function CursorDayDetail({
  currentDay, previousDay, metric, contributors, cursorIndex,
}: {
  currentDay: ChartPoint;
  previousDay: ChartPoint | null;
  metric: MetricType;
  contributors: ProviderContribution[];
  cursorIndex: number;
}) {
  const colors = useColors();

  const dayValue = getMetricValue(currentDay, metric);
  const prevDayValue = previousDay ? getMetricValue(previousDay, metric) : null;
  const dayDelta = prevDayValue !== null ? fmtDeltaPct(dayValue, prevDayValue) : null;

  return (
    <box flexDirection="column" paddingX={1}>
      <text fg={colors.primary} height={1}><strong>{currentDay.dayName} DETAIL</strong></text>
      <box flexDirection="row" justifyContent="space-between" height={1}>
        <text fg={colors.textMuted} height={1}>Cost</text>
        <text fg={colors.success} height={1}><strong>{fmtCurrency(currentDay.costUsd)}</strong></text>
      </box>
      <box flexDirection="row" justifyContent="space-between" height={1}>
        <text fg={colors.textMuted} height={1}>Tokens</text>
        <text fg={colors.text} height={1}>{fmtTokens(currentDay.tokens)}</text>
      </box>
      <box flexDirection="row" justifyContent="space-between" height={1}>
        <text fg={colors.textMuted} height={1}>Requests</text>
        <text fg={colors.text} height={1}>{fmtNumber(currentDay.requestCount)}</text>
      </box>
      {dayDelta && (
        <box flexDirection="row" justifyContent="space-between" height={1}>
          <text fg={colors.textMuted} height={1}>vs prev day</text>
          <text fg={dayDelta.positive ? colors.success : colors.error} height={1}>{dayDelta.text}</text>
        </box>
      )}

      {contributors.length > 0 && (
        <box flexDirection="column">
          <box height={1}>
            <text fg={colors.border} height={1}>{'─'.repeat(20)}</text>
          </box>
          <text fg={colors.textMuted} height={1}><strong>PROVIDERS</strong></text>
          {contributors.map((c) => {
            const dayCost = c.dailyCosts[cursorIndex] ?? 0;
            return (
              <box key={c.provider} flexDirection="row" justifyContent="space-between" height={1}>
                <text fg={colors.primary} height={1}>{truncate(c.provider, 12)}</text>
                <text fg={colors.text} height={1}>{fmtCurrency(dayCost)}</text>
              </box>
            );
          })}
        </box>
      )}
    </box>
  );
}

// ============================================================================
// Condensed horizontal strip (narrow terminals ≤100 cols)
// ============================================================================

function CondensedStrip({
  summary, prevSummary, contributors,
}: {
  summary: PeriodSummary;
  prevSummary: PeriodSummary;
  contributors: ProviderContribution[];
}) {
  const colors = useColors();
  const costDelta = fmtDeltaPct(summary.totalCost, prevSummary.totalCost);

  return (
    <box flexDirection="row" height={2} paddingX={1} gap={2}>
      <box flexDirection="column">
        <text fg={colors.textMuted} height={1}>Total: <span fg={colors.success}><strong>{fmtCurrency(summary.totalCost)}</strong></span></text>
        <text fg={colors.textMuted} height={1}>
          {'Avg: '}{fmtCurrency(summary.avgPerDay)}{'/d  '}
          <span fg={costDelta.positive ? colors.success : colors.error}>{costDelta.text}</span>
        </text>
      </box>
      {contributors.length > 0 && (
        <box flexDirection="column">
          <text fg={colors.textMuted} height={1}>Top:</text>
          <text height={1}>
            {contributors.slice(0, 3).map((c, i) => (
              <span key={c.provider}>
                {i > 0 ? '  ' : ''}
                <span fg={colors.primary}>{truncate(c.provider, 8)}</span>
                <span fg={colors.text}>{' '}{fmtCurrency(c.cost)}</span>
              </span>
            ))}
          </text>
        </box>
      )}
    </box>
  );
}

// ============================================================================
// Full Insight Panel
// ============================================================================

function InsightPanel({
  summary, prevSummary, contributors, previousContributors,
  metric, breakdown, comparisonMode, cursorMode, cursorIndex, data, panelWidth,
}: {
  summary: PeriodSummary;
  prevSummary: PeriodSummary;
  contributors: ProviderContribution[];
  previousContributors: ProviderContribution[];
  metric: MetricType;
  breakdown: BreakdownDimension;
  comparisonMode: boolean;
  cursorMode: boolean;
  cursorIndex: number;
  data: ChartPoint[];
  panelWidth: number;
}) {
  const colors = useColors();

  // Cursor mode: show day detail
  if (cursorMode && data[cursorIndex]) {
    const currentDay = data[cursorIndex]!;
    const previousDay = cursorIndex > 0 ? (data[cursorIndex - 1] ?? null) : null;

    return (
      <box
        flexDirection="column"
        width={panelWidth}
        border
        borderStyle="single"
        borderColor={colors.border}
        overflow="hidden"
        gap={1}
      >
        <CursorDayDetail
          currentDay={currentDay}
          previousDay={previousDay}
          metric={metric}
          contributors={contributors}
          cursorIndex={cursorIndex}
        />
      </box>
    );
  }

  // Comparison mode: show comparison table
  if (comparisonMode) {
    return (
      <box
        flexDirection="column"
        width={panelWidth}
        border
        borderStyle="single"
        borderColor={colors.accent}
        overflow="hidden"
        gap={1}
      >
        <ComparisonTable
          current={summary}
          previous={prevSummary}
          currentContributors={contributors}
          previousContributors={previousContributors}
        />
      </box>
    );
  }

  // Default: summary + deltas + contributors
  return (
    <box
      flexDirection="column"
      width={panelWidth}
      border
      borderStyle="single"
      borderColor={colors.border}
      overflow="hidden"
      gap={1}
    >
      <PeriodSummarySection summary={summary} metric={metric} />

      <box paddingX={1} height={1}>
        <text fg={colors.border} height={1}>{'─'.repeat(Math.max(0, panelWidth - 4))}</text>
      </box>

      <DeltaSection current={summary} previous={prevSummary} />

      <box paddingX={1} height={1}>
        <text fg={colors.border} height={1}>{'─'.repeat(Math.max(0, panelWidth - 4))}</text>
      </box>

      <ContributorsSection
        contributors={contributors}
        breakdown={breakdown}
        panelWidth={panelWidth}
      />
    </box>
  );
}

// ============================================================================
// Main View
// ============================================================================

export function HistoricalTrendsView() {
  const colors = useColors();
  const isStorageReady = useStorageReady();
  const { demoMode, simulator } = useDemoMode();
  const { width: terminalWidth, height: terminalHeight } = useTerminalDimensions();

  // State
  const [period, setPeriod] = useState<TimePeriod>('7d');
  const [metric, setMetric] = useState<MetricType>('cost');
  const [breakdown, setBreakdown] = useState<BreakdownDimension>('provider');
  const [showInsight, setShowInsight] = useState(true);
  const [comparisonMode, setComparisonMode] = useState(false);
  const [cursorMode, setCursorMode] = useState(false);
  const [cursorIndex, setCursorIndex] = useState(0);

  // Data
  const [data, setData] = useState<ChartPoint[]>([]);
  const [prevData, setPrevData] = useState<ChartPoint[]>([]);
  const [contributors, setContributors] = useState<ProviderContribution[]>([]);
  const [prevContributors, setPrevContributors] = useState<ProviderContribution[]>([]);

  // Layout
  const isNarrow = terminalWidth <= 100;
  const panelVisible = showInsight && !isNarrow;
  const panelWidth = panelVisible ? Math.max(28, Math.floor(terminalWidth * 0.3)) : 0;
  const chartWidth = panelVisible
    ? Math.max(40, terminalWidth - panelWidth - 8)
    : Math.max(40, terminalWidth - 6);
  const chartHeight = isNarrow
    ? Math.max(6, terminalHeight - 14)
    : Math.max(8, terminalHeight - 8);

  // Fetch data
  useEffect(() => {
    if (demoMode && simulator) {
      setData(fetchDemoTimeSeries(simulator, period, 0));
      setPrevData(fetchDemoTimeSeries(simulator, period, 1));
      setContributors(fetchDemoProviderBreakdown(simulator, period));
      setPrevContributors(fetchDemoPrevContributors(simulator, period));
    } else if (isStorageReady) {
      setData(fetchTimeSeries(period, 0));
      setPrevData(fetchTimeSeries(period, 1));
      setContributors(fetchProviderBreakdown(period));
      setPrevContributors([]);
    }
  }, [isStorageReady, period, demoMode, simulator]);

  // Reset cursor when data changes
  useEffect(() => {
    setCursorIndex(Math.max(0, data.length - 1));
  }, [data.length]);

  // Computed values
  const summary = useMemo(() => computeSummary(data, metric), [data, metric]);
  const prevSummary = useMemo(() => computeSummary(prevData, metric), [prevData, metric]);
  const hasData = data.some(p => p.costUsd > 0 || p.tokens > 0 || p.requestCount > 0);
  const totalCost = useMemo(() => data.reduce((acc, p) => acc + p.costUsd, 0), [data]);

  // Keyboard
  useKeyboard((key) => {
    if (key.name === 'left' || key.name === 'h') {
      if (cursorMode) {
        setCursorIndex(prev => Math.max(0, prev - 1));
      } else {
        setPeriod(prev => prev === '90d' ? '30d' : prev === '30d' ? '7d' : '7d');
      }
    }
    if (key.name === 'right' || key.name === 'l') {
      if (cursorMode) {
        setCursorIndex(prev => Math.min(data.length - 1, prev + 1));
      } else {
        setPeriod(prev => prev === '7d' ? '30d' : prev === '30d' ? '90d' : '90d');
      }
    }

    if (key.name === 'down' || key.name === 'j') {
      if (!cursorMode) {
        setCursorMode(true);
        setCursorIndex(Math.max(0, data.length - 1));
      } else {
        setCursorIndex(prev => Math.min(data.length - 1, prev + 1));
      }
    }
    if (key.name === 'up' || key.name === 'k') {
      if (!cursorMode) {
        setCursorMode(true);
        setCursorIndex(Math.max(0, data.length - 1));
      } else {
        setCursorIndex(prev => Math.max(0, prev - 1));
      }
    }

    if (key.name === 'escape') {
      if (cursorMode) setCursorMode(false);
      else if (comparisonMode) setComparisonMode(false);
    }

    if (key.name === 'c') setComparisonMode(prev => !prev);
    if (key.name === 'm') setMetric(prev => prev === 'cost' ? 'tokens' : prev === 'tokens' ? 'requests' : 'cost');
    if (key.name === 'b') setBreakdown(prev => prev === 'provider' ? 'model' : prev === 'model' ? 'project' : prev === 'project' ? 'off' : 'provider');
    if (key.name === 'i') setShowInsight(prev => !prev);
  });

  const periodLabel = period === '7d' ? '7 days' : period === '30d' ? '30 days' : '90 days';
  const modeIndicators: string[] = [];
  if (comparisonMode) modeIndicators.push('CMP');
  if (cursorMode) modeIndicators.push('CURSOR');
  if (metric !== 'cost') modeIndicators.push(METRIC_LABELS[metric]);

  return (
    <box flexDirection="column" flexGrow={1} padding={1} border borderStyle="single" borderColor={colors.border}>
      {/* Header */}
      <box flexDirection="row" justifyContent="space-between" height={1} marginBottom={1}>
        <text height={1}>
          <span fg={colors.primary}><strong>{' '}{METRIC_LABELS[metric]} TREND{' '}</strong></span>
          <span fg={colors.textMuted}>({periodLabel})</span>
          {modeIndicators.length > 0 && (
            <span fg={colors.accent}>{' '}[{modeIndicators.join(' | ')}]</span>
          )}
        </text>
        <text height={1}>
          <span fg={colors.textMuted}>Total: </span>
          <span fg={colors.success}><strong>${totalCost.toFixed(2)}</strong></span>
        </text>
      </box>

      {/* Main content */}
      <box flexGrow={1} flexDirection={isNarrow ? 'column' : 'row'} gap={1}>
        {/* Chart pane */}
        <box flexGrow={1} flexDirection="column" justifyContent="center">
          {!isStorageReady && !demoMode ? (
            <text fg={colors.textMuted}>Loading storage...</text>
          ) : !hasData ? (
            <box flexDirection="column" alignItems="center" gap={1}>
              <text fg={colors.textMuted}>No usage data recorded yet.</text>
              <text fg={colors.textSubtle}>Data will appear as you use AI providers.</text>
            </box>
          ) : (
            <AsciiChart
              data={data}
              comparisonData={comparisonMode ? prevData : undefined}
              metric={metric}
              cursorIndex={cursorMode ? cursorIndex : null}
              height={chartHeight}
              width={chartWidth}
              color={colors.primary}
              ghostColor={colors.borderMuted}
              cursorColor={colors.accent}
              labelColor={colors.textMuted}
              gridColor={colors.border}
            />
          )}
        </box>

        {/* Insight panel */}
        {showInsight && hasData && (
          isNarrow ? (
            <CondensedStrip
              summary={summary}
              prevSummary={prevSummary}
              contributors={contributors}
            />
          ) : (
            <InsightPanel
              summary={summary}
              prevSummary={prevSummary}
              contributors={contributors}
              previousContributors={prevContributors}
              metric={metric}
              breakdown={breakdown}
              comparisonMode={comparisonMode}
              cursorMode={cursorMode}
              cursorIndex={cursorIndex}
              data={data}
              panelWidth={panelWidth}
            />
          )
        )}
      </box>

      {/* Footer */}
      <box flexDirection="row" marginTop={1} height={1}>
        <text height={1} fg={colors.textSubtle}>
          {cursorMode ? (
            <span>
              <span fg={colors.accent}>CURSOR</span>
              {'  ←→ move  Esc exit  c compare  m metric  i panel'}
            </span>
          ) : (
            <span>
              <span fg={period === '7d' ? colors.primary : colors.textSubtle}>7d</span>
              {'  '}
              <span fg={period === '30d' ? colors.primary : colors.textSubtle}>30d</span>
              {'  '}
              <span fg={period === '90d' ? colors.primary : colors.textSubtle}>90d</span>
              {'    h/l period  ↑↓ cursor  c compare  m metric  b breakdown  i panel'}
            </span>
          )}
        </text>
      </box>
    </box>
  );
}
