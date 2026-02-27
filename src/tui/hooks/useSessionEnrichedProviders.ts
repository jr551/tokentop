import type { ProviderUsageData } from "@tokentop/plugin-sdk";
import { useMemo } from "react";
import type { AgentSessionAggregate } from "@/agents/types.ts";
import type { ProviderState } from "../contexts/PluginContext.tsx";

interface ProviderSessionTotals {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  costToday: number;
  costMonth: number;
}

function aggregateSessionsByProvider(
  sessions: AgentSessionAggregate[],
): Map<string, ProviderSessionTotals> {
  const totals = new Map<string, ProviderSessionTotals>();

  for (const session of sessions) {
    for (const stream of session.streams) {
      const pid = stream.providerId;
      let entry = totals.get(pid);
      if (!entry) {
        entry = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, costToday: 0, costMonth: 0 };
        totals.set(pid, entry);
      }
      entry.input += stream.tokens.input;
      entry.output += stream.tokens.output;
      entry.cacheRead += stream.tokens.cacheRead ?? 0;
      entry.cacheWrite += stream.tokens.cacheWrite ?? 0;
    }

    // Cost is session-level — attribute to providers proportionally by token share
    if (session.streams.length > 0) {
      const totalSessionTokens = session.streams.reduce(
        (s, st) =>
          s +
          st.tokens.input +
          st.tokens.output +
          (st.tokens.cacheRead ?? 0) +
          (st.tokens.cacheWrite ?? 0),
        0,
      );

      for (const stream of session.streams) {
        const pid = stream.providerId;
        const entry = totals.get(pid)!;
        const streamTokens =
          stream.tokens.input +
          stream.tokens.output +
          (stream.tokens.cacheRead ?? 0) +
          (stream.tokens.cacheWrite ?? 0);
        const ratio = totalSessionTokens > 0 ? streamTokens / totalSessionTokens : 0;
        entry.costToday += session.costInDay * ratio;
        entry.costMonth += session.costInMonth * ratio;
      }
    }
  }

  return totals;
}

function enrichUsageData(
  usage: ProviderUsageData,
  sessionTotals: ProviderSessionTotals,
): ProviderUsageData {
  const enriched = { ...usage };

  if (!enriched.tokens && (sessionTotals.input > 0 || sessionTotals.output > 0)) {
    enriched.tokens = {
      input: sessionTotals.input,
      output: sessionTotals.output,
      ...(sessionTotals.cacheRead > 0 ? { cacheRead: sessionTotals.cacheRead } : {}),
      ...(sessionTotals.cacheWrite > 0 ? { cacheWrite: sessionTotals.cacheWrite } : {}),
    };
  }

  const hasSessionCost = sessionTotals.costToday > 0 || sessionTotals.costMonth > 0;
  if (hasSessionCost) {
    const costObj: NonNullable<ProviderUsageData["cost"]> = {
      source: enriched.cost?.source ?? "estimated",
    };
    if (enriched.cost?.actual) costObj.actual = enriched.cost.actual;
    if (enriched.cost?.estimated) {
      costObj.estimated = enriched.cost.estimated;
    } else if (sessionTotals.costToday > 0) {
      costObj.estimated = { total: sessionTotals.costToday, currency: "USD" };
    }
    if (sessionTotals.costToday > 0) {
      costObj.estimatedDaily = { total: sessionTotals.costToday, currency: "USD" };
    }
    if (sessionTotals.costMonth > 0) {
      costObj.estimatedMonthly = { total: sessionTotals.costMonth, currency: "USD" };
    }
    enriched.cost = costObj;
  }

  return enriched;
}

function findProviderMatch(
  providerId: string,
  providers: Map<string, ProviderState>,
): string | null {
  if (providers.has(providerId)) return providerId;

  for (const [pluginId, state] of providers) {
    const aliases = state.plugin.meta?.providerAliases ?? [];
    if (aliases.includes(providerId)) return pluginId;
    if (pluginId.includes(providerId) || providerId.includes(pluginId)) return pluginId;
  }
  return null;
}

export function useSessionEnrichedProviders(
  providers: Map<string, ProviderState>,
  sessions: AgentSessionAggregate[],
): Map<string, ProviderState> {
  return useMemo(() => {
    if (sessions.length === 0) return providers;

    const sessionTotals = aggregateSessionsByProvider(sessions);
    if (sessionTotals.size === 0) return providers;

    const enriched = new Map(providers);
    let changed = false;

    for (const [sessionProviderId, totals] of sessionTotals) {
      const pluginId = findProviderMatch(sessionProviderId, providers);
      if (!pluginId) continue;

      const state = enriched.get(pluginId);
      if (!state?.usage) continue;
      const alreadyHasAll =
        state.usage.tokens &&
        state.usage.cost?.estimatedDaily &&
        state.usage.cost?.estimatedMonthly;
      if (alreadyHasAll) continue;

      const enrichedUsage = enrichUsageData(state.usage, totals);
      if (enrichedUsage !== state.usage) {
        enriched.set(pluginId, { ...state, usage: enrichedUsage });
        changed = true;
      }
    }

    return changed ? enriched : providers;
  }, [providers, sessions]);
}
