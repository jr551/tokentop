import { useTerminalDimensions } from "@opentui/react";
import { useMemo } from "react";
import type { ProviderState } from "../contexts/PluginContext.tsx";
import { useColors } from "../contexts/ThemeContext.tsx";

function pad(str: string, len: number): string {
  return str.length >= len ? str.slice(0, len) : str + " ".repeat(len - str.length);
}

function formatCost(val: number): string {
  if (val >= 1000) return `$${(val / 1000).toFixed(1)}k`;
  if (val >= 100) return `$${Math.round(val)}`;
  if (val >= 10) return `$${val.toFixed(1)}`;
  return `$${val.toFixed(2)}`;
}

function formatTokens(val: number): string {
  if (val >= 1_000_000_000) return `${(val / 1_000_000_000).toFixed(1)}B`;
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `${(val / 1_000).toFixed(1)}K`;
  return String(Math.round(val));
}

export interface ProviderAggregates {
  okCount: number;
  warnCount: number;
  errCount: number;
  costToday: number;
  costTodayEstimated: boolean;
  costMtd: number;
  costMtdEstimated: boolean;
  totalTokens24h: number;
  tokens24hEstimated: boolean;
  hottestProvider: string | null;
  hottestPercent: number;
  trendVsYesterday: number | null;
}

export function computeAggregates(providers: ProviderState[]): ProviderAggregates {
  let okCount = 0;
  let warnCount = 0;
  let errCount = 0;
  let costToday = 0;
  let costMtd = 0;
  let costTodayEstimated = false;
  let costMtdEstimated = false;
  let totalTokens24h = 0;
  let tokens24hEstimated = false;
  let hottestProvider: string | null = null;
  let hottestPercent = 0;

  for (const p of providers) {
    if (!p.configured) continue;

    if (p.usage?.error) {
      errCount++;
    } else if (p.usage?.limitReached || getMaxUsage(p) >= 80) {
      warnCount++;
    } else {
      okCount++;
    }

    if (p.usage?.cost) {
      const cost = p.usage.cost;
      const todayTotal =
        cost.estimatedDaily?.total ?? cost.actual?.total ?? cost.estimated?.total ?? 0;
      const mtdTotal =
        cost.estimatedMonthly?.total ?? cost.actual?.total ?? cost.estimated?.total ?? 0;
      costToday += todayTotal;
      costMtd += mtdTotal;
      if (cost.source === "estimated" || cost.estimatedDaily || cost.estimatedMonthly) {
        costTodayEstimated = true;
        costMtdEstimated = true;
      }
    }

    if (p.usage?.tokens) {
      const t = p.usage.tokens;
      totalTokens24h += t.input + t.output + (t.cacheRead ?? 0) + (t.cacheWrite ?? 0);
      tokens24hEstimated = true;
    }

    const maxUsage = getMaxUsage(p);
    if (maxUsage > hottestPercent) {
      hottestPercent = maxUsage;
      hottestProvider = p.plugin.name;
    }
  }

  return {
    okCount,
    warnCount,
    errCount,
    costToday,
    costTodayEstimated,
    costMtd,
    costMtdEstimated,
    totalTokens24h,
    tokens24hEstimated,
    hottestProvider,
    hottestPercent,
    trendVsYesterday: null,
  };
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

interface ProviderAggregateStripProps {
  providers: ProviderState[];
}

export function ProviderAggregateStrip({ providers }: ProviderAggregateStripProps) {
  const colors = useColors();
  const { width: termWidth } = useTerminalDimensions();
  const isCompact = termWidth < 100;

  const agg = useMemo(() => computeAggregates(providers), [providers]);

  const costTodayStr = `${agg.costTodayEstimated ? "~" : ""}${formatCost(agg.costToday)}`;
  const costMtdStr = `${agg.costMtdEstimated ? "~" : ""}${formatCost(agg.costMtd)}`;
  const tokensStr = `${agg.tokens24hEstimated ? "~" : ""}${formatTokens(agg.totalTokens24h)}`;

  const trendStr =
    agg.trendVsYesterday !== null
      ? agg.trendVsYesterday >= 0
        ? `+${agg.trendVsYesterday.toFixed(0)}%`
        : `${agg.trendVsYesterday.toFixed(0)}%`
      : "—";
  const trendColor =
    agg.trendVsYesterday !== null
      ? agg.trendVsYesterday > 10
        ? colors.warning
        : agg.trendVsYesterday < -10
          ? colors.success
          : colors.textMuted
      : colors.textSubtle;

  return (
    <box flexDirection="column" flexShrink={0}>
      <box flexDirection="row" height={1} gap={2} paddingX={1}>
        <text height={1}>
          <span fg={colors.textMuted}>HEALTH </span>
          {agg.okCount > 0 && (
            <span fg={colors.success}>{pad(`${agg.okCount} ok`, isCompact ? 5 : 5)}</span>
          )}
          {agg.warnCount > 0 && (
            <span fg={colors.warning}> {pad(`${agg.warnCount} warn`, isCompact ? 7 : 7)}</span>
          )}
          {agg.errCount > 0 && (
            <span fg={colors.error}> {pad(`${agg.errCount} err`, isCompact ? 6 : 6)}</span>
          )}
          {agg.okCount === 0 && agg.warnCount === 0 && agg.errCount === 0 && (
            <span fg={colors.textSubtle}>no providers</span>
          )}
        </text>

        <text fg={colors.textSubtle} height={1}>
          │
        </text>

        <text height={1}>
          <span fg={colors.textMuted}>TODAY </span>
          <span fg={agg.costTodayEstimated ? colors.textMuted : colors.success}>
            {costTodayStr}
          </span>
        </text>

        {!isCompact && (
          <>
            <text fg={colors.textSubtle} height={1}>
              │
            </text>
            <text height={1}>
              <span fg={colors.textMuted}>MTD </span>
              <span fg={agg.costMtdEstimated ? colors.textMuted : colors.success}>
                {costMtdStr}
              </span>
            </text>
          </>
        )}

        <text fg={colors.textSubtle} height={1}>
          │
        </text>

        <text height={1}>
          <span fg={colors.textMuted}>TOKENS </span>
          <span fg={agg.tokens24hEstimated ? colors.textMuted : colors.primary}>{tokensStr}</span>
        </text>
      </box>

      <box flexDirection="row" height={1} gap={2} paddingX={1}>
        {agg.hottestProvider && (
          <>
            <text height={1}>
              <span fg={colors.textMuted}>HOTTEST </span>
              <span fg={agg.hottestPercent >= 80 ? colors.warning : colors.text}>
                {pad(agg.hottestProvider, isCompact ? 10 : 14)}
              </span>
              <span fg={agg.hottestPercent >= 80 ? colors.warning : colors.textMuted}>
                {` ${Math.round(agg.hottestPercent)}%`}
              </span>
            </text>

            <text fg={colors.textSubtle} height={1}>
              │
            </text>
          </>
        )}

        <text height={1}>
          <span fg={colors.textMuted}>vs YESTERDAY </span>
          <span fg={trendColor}>{trendStr}</span>
        </text>
      </box>

      <box height={1} overflow="hidden">
        <text fg={colors.border}>{"─".repeat(300)}</text>
      </box>
    </box>
  );
}
