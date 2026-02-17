import type { UsageLimit } from "@/plugins/types/provider.ts";
import type { ProviderState } from "../contexts/PluginContext.tsx";
import { useColors } from "../contexts/ThemeContext.tsx";
import { Sparkline } from "./Sparkline.tsx";
import { UsageGauge } from "./UsageGauge.tsx";

function pad(str: string, len: number): string {
  return str.length >= len ? str.slice(0, len) : str + " ".repeat(len - str.length);
}

function padStart(str: string, len: number): string {
  return str.length >= len ? str.slice(0, len) : " ".repeat(len - str.length) + str;
}

function formatTokenCount(val: number): string {
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(2)}M`;
  if (val >= 1_000) return `${(val / 1_000).toFixed(1)}K`;
  return String(Math.round(val));
}

function formatCost(val: number): string {
  if (val >= 100) return `$${Math.round(val)}`;
  if (val >= 1) return `$${val.toFixed(2)}`;
  return `$${val.toFixed(4)}`;
}

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  const s = d.getSeconds().toString().padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function formatWindow(minutes: number): string {
  if (minutes >= 1440) {
    const days = Math.round(minutes / 1440);
    return `${days}d window`;
  }
  if (minutes >= 60) {
    const hours = Math.round(minutes / 60);
    return `${hours}h window`;
  }
  return `${minutes}m window`;
}

interface ProviderDetailPanelProps {
  provider: ProviderState;
}

export function ProviderDetailPanel({ provider }: ProviderDetailPanelProps) {
  const colors = useColors();
  const usage = provider.usage;
  const providerColor = provider.plugin.meta?.brandColor ?? colors.primary;

  if (!usage) {
    return (
      <box border borderColor={colors.border} borderStyle="rounded" padding={1} flexShrink={0}>
        <text fg={colors.textMuted}>No usage data available</text>
      </box>
    );
  }

  const allLimits: UsageLimit[] = [];
  if (usage.limits?.items && usage.limits.items.length > 0) {
    allLimits.push(...usage.limits.items);
  } else {
    if (usage.limits?.primary) allLimits.push(usage.limits.primary);
    if (usage.limits?.secondary) allLimits.push(usage.limits.secondary);
  }

  const historyValues = provider.history.map((s) => s.usedPercent ?? 0);
  const peak = historyValues.length > 0 ? Math.max(...historyValues) : 0;
  const avg =
    historyValues.length > 0 ? historyValues.reduce((a, b) => a + b, 0) / historyValues.length : 0;

  const tokens = usage.tokens;
  const cost = usage.cost;
  const credits = usage.credits;
  const lastRefreshed = usage.fetchedAt;

  return (
    <box
      border
      borderColor={providerColor}
      borderStyle="rounded"
      flexDirection="column"
      paddingX={1}
      gap={0}
      flexShrink={0}
    >
      <box flexDirection="row" justifyContent="space-between" height={1}>
        <text fg={providerColor} height={1}>
          <strong>{provider.plugin.name}</strong>
          {usage.planType ? ` · ${usage.planType}` : ""}
        </text>
        <text fg={colors.textMuted} height={1}>
          {`Last: ${formatTimestamp(lastRefreshed)}`}
        </text>
      </box>

      <box flexDirection="row" gap={2} paddingTop={1}>
        <box flexDirection="column" flexGrow={1} gap={1}>
          {allLimits.length > 0 && (
            <box flexDirection="column" gap={1}>
              {allLimits.map((limit, idx) => {
                const label = limit.label ?? "Usage";
                const windowStr = limit.windowMinutes
                  ? formatWindow(limit.windowMinutes)
                  : undefined;
                const labelHasWindow =
                  label.toLowerCase().includes("window") ||
                  label.toLowerCase().includes("hour") ||
                  label.toLowerCase().includes("day");
                return (
                  <box key={idx} flexDirection="column">
                    <UsageGauge
                      label={label}
                      usedPercent={limit.usedPercent}
                      color={providerColor}
                      width={40}
                      {...(windowStr && !labelHasWindow ? { windowLabel: windowStr } : {})}
                      {...(limit.resetsAt ? { resetsAt: limit.resetsAt } : {})}
                    />
                  </box>
                );
              })}
            </box>
          )}

          {tokens && (
            <box flexDirection="column">
              <text fg={colors.textMuted} height={1}>
                TOKEN BREAKDOWN
              </text>
              <box flexDirection="column">
                <text height={1}>
                  <span fg={colors.textMuted}>{pad("Input:", 14)}</span>
                  <span fg={colors.text}>{padStart(formatTokenCount(tokens.input), 10)}</span>
                </text>
                <text height={1}>
                  <span fg={colors.textMuted}>{pad("Output:", 14)}</span>
                  <span fg={colors.text}>{padStart(formatTokenCount(tokens.output), 10)}</span>
                </text>
                {tokens.cacheRead !== undefined && tokens.cacheRead > 0 && (
                  <text height={1}>
                    <span fg={colors.textMuted}>{pad("Cache Read:", 14)}</span>
                    <span fg={colors.text}>{padStart(formatTokenCount(tokens.cacheRead), 10)}</span>
                  </text>
                )}
                {tokens.cacheWrite !== undefined && tokens.cacheWrite > 0 && (
                  <text height={1}>
                    <span fg={colors.textMuted}>{pad("Cache Write:", 14)}</span>
                    <span fg={colors.text}>
                      {padStart(formatTokenCount(tokens.cacheWrite), 10)}
                    </span>
                  </text>
                )}
              </box>
            </box>
          )}
        </box>

        <box flexDirection="column" flexGrow={1} gap={1}>
          {cost && (
            <box flexDirection="column">
              <text fg={colors.textMuted} height={1}>
                COST BREAKDOWN
              </text>
              {cost.actual && (
                <box flexDirection="column">
                  <text height={1}>
                    <span fg={colors.textMuted}>{pad("Total:", 14)}</span>
                    <span fg={colors.success}>{padStart(formatCost(cost.actual.total), 10)}</span>
                  </text>
                  {cost.actual.input !== undefined && (
                    <text height={1}>
                      <span fg={colors.textMuted}>{pad("Input:", 14)}</span>
                      <span fg={colors.text}>{padStart(formatCost(cost.actual.input), 10)}</span>
                    </text>
                  )}
                  {cost.actual.output !== undefined && (
                    <text height={1}>
                      <span fg={colors.textMuted}>{pad("Output:", 14)}</span>
                      <span fg={colors.text}>{padStart(formatCost(cost.actual.output), 10)}</span>
                    </text>
                  )}
                </box>
              )}
              {!cost.actual && cost.estimated && (
                <box flexDirection="column">
                  <text height={1}>
                    <span fg={colors.textMuted}>{pad("Total:", 14)}</span>
                    <span fg={colors.textMuted}>
                      {padStart(`~${formatCost(cost.estimated.total)}`, 10)}
                    </span>
                  </text>
                  {cost.estimated.input !== undefined && (
                    <text height={1}>
                      <span fg={colors.textMuted}>{pad("Input:", 14)}</span>
                      <span fg={colors.textMuted}>
                        {padStart(`~${formatCost(cost.estimated.input)}`, 10)}
                      </span>
                    </text>
                  )}
                  {cost.estimated.output !== undefined && (
                    <text height={1}>
                      <span fg={colors.textMuted}>{pad("Output:", 14)}</span>
                      <span fg={colors.textMuted}>
                        {padStart(`~${formatCost(cost.estimated.output)}`, 10)}
                      </span>
                    </text>
                  )}
                </box>
              )}
            </box>
          )}

          {credits && (
            <box flexDirection="row" gap={1} height={1}>
              <text fg={colors.textMuted} height={1}>
                Credits:
              </text>
              <text fg={credits.unlimited ? colors.success : colors.text} height={1}>
                {credits.unlimited ? "Unlimited" : (credits.balance ?? "—")}
              </text>
            </box>
          )}
        </box>
      </box>

      {historyValues.length >= 2 && (
        <box flexDirection="column" paddingTop={1}>
          <box flexDirection="row" justifyContent="space-between" height={1}>
            <text fg={colors.textMuted} height={1}>
              USAGE TREND
            </text>
            <text fg={colors.textSubtle} height={1}>
              {`peak:${Math.round(peak)}%  avg:${Math.round(avg)}%`}
            </text>
          </box>
          <Sparkline
            data={historyValues}
            width={30}
            fixedMax={100}
            thresholds={{ warning: 70, error: 90 }}
            style="braille"
            orientation="up"
            showBaseline={true}
          />
        </box>
      )}
    </box>
  );
}
