import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useKeyboard, useTerminalDimensions } from '@opentui/react';
import { RGBA } from '@opentui/core';
import { useAgentSessions } from '../contexts/AgentSessionContext.tsx';
import { useColors } from '../contexts/ThemeContext.tsx';
import { useTimeWindow } from '../contexts/TimeWindowContext.tsx';
import { useInputFocus } from '../contexts/InputContext.tsx';
import type { AgentSessionAggregate } from '../../agents/types.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SortField = 'cost' | 'share' | 'sessions' | 'cache' | 'cpr' | 'activity';

interface ModelStats {
  modelId: string;
  providerId: string;
  cost: number;
  requests: number;
  tokens: number;
}

interface AgentStats {
  agentName: string;
  cost: number;
  sessions: number;
}

interface ProjectStats {
  path: string;
  name: string;
  sessionCount: number;
  activeSessions: number;
  tokens: number;
  inputTokens: number;
  outputTokens: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
  requestCount: number;
  models: ModelStats[];
  agents: AgentStats[];
  sessions: AgentSessionAggregate[];
  /** 5-char sparkline trend over recent buckets */
  trend: number[];
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

const OVERLAY_BG = RGBA.fromValues(0.0, 0.0, 0.0, 0.5);

function padRight(str: string, len: number): string {
  if (str.length >= len) return str.slice(0, len);
  return str + ' '.repeat(len - str.length);
}

function padLeft(str: string, len: number): string {
  if (str.length >= len) return str.slice(0, len);
  return ' '.repeat(len - str.length) + str;
}

function formatCost(num: number): string {
  if (num === 0) return '$0';
  if (num < 0.01) return '<$0.01';
  if (num < 10) return `$${num.toFixed(2)}`;
  if (num < 100) return `$${num.toFixed(1)}`;
  if (num < 1000) return `$${Math.round(num)}`;
  return `$${(num / 1000).toFixed(1)}k`;
}

function formatTokensCompact(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return `${num}`;
}

function formatPercent(val: number): string {
  if (val < 1 && val > 0) return '<1%';
  return `${Math.round(val)}%`;
}

function formatRelativeTime(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h`;
  const diffDay = Math.floor(diffHour / 24);
  return `${diffDay}d`;
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + '\u2026';
}

// Sparkline characters for 5-char mini trend
const SPARK_CHARS = ['\u2581', '\u2582', '\u2583', '\u2584', '\u2585', '\u2586', '\u2587', '\u2588'];

function miniSparkline(values: number[], width: number): string {
  if (values.length === 0) return '\u00B7'.repeat(width);
  // Bucket into `width` slots
  const bucketSize = Math.max(1, Math.ceil(values.length / width));
  const buckets: number[] = [];
  for (let i = 0; i < width; i++) {
    const start = i * bucketSize;
    const end = Math.min(start + bucketSize, values.length);
    const slice = values.slice(start, end);
    buckets.push(slice.length > 0 ? slice.reduce((a, b) => a + b, 0) : 0);
  }
  const maxVal = Math.max(...buckets, 1);
  return buckets
    .map((v) => {
      if (v === 0) return '\u00B7';
      const idx = Math.min(Math.floor((v / maxVal) * SPARK_CHARS.length), SPARK_CHARS.length - 1);
      return SPARK_CHARS[idx]!;
    })
    .join('');
}

function makeBar(percent: number, width: number): string {
  const clamped = Math.max(0, Math.min(100, percent));
  const filled = Math.round((clamped / 100) * width);
  return '\u2588'.repeat(filled) + '\u00B7'.repeat(width - filled);
}

// ---------------------------------------------------------------------------
// Project aggregation
// ---------------------------------------------------------------------------

function aggregateProjects(
  sessions: AgentSessionAggregate[],
  windowStart: number | null,
): ProjectStats[] {
  const statsMap = new Map<string, ProjectStats>();

  const filtered = windowStart !== null
    ? sessions.filter((s) => s.lastActivityAt >= windowStart)
    : sessions;

  for (const session of filtered) {
    const path = session.projectPath || 'Unknown';
    const name = session.projectPath
      ? session.projectPath.split('/').pop() || session.projectPath
      : 'Unknown';

    let project = statsMap.get(path);
    if (!project) {
      project = {
        path,
        name,
        sessionCount: 0,
        activeSessions: 0,
        tokens: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheRead: 0,
        cacheWrite: 0,
        cost: 0,
        requestCount: 0,
        models: [],
        agents: [],
        sessions: [],
        trend: [],
      };
      statsMap.set(path, project);
    }

    project.sessionCount += 1;
    if (session.status === 'active') project.activeSessions += 1;
    project.inputTokens += session.totals.input;
    project.outputTokens += session.totals.output;
    project.cacheRead += session.totals.cacheRead ?? 0;
    project.cacheWrite += session.totals.cacheWrite ?? 0;
    project.tokens += session.totals.input + session.totals.output;
    project.cost += session.totalCostUsd ?? 0;
    project.requestCount += session.requestCount;
    project.sessions.push(session);
  }

  // Compute model & agent breakdowns + trend for each project
  for (const project of statsMap.values()) {
    // Model breakdown
    const modelMap = new Map<string, ModelStats>();
    const agentMap = new Map<string, AgentStats>();

    for (const session of project.sessions) {
      // Agent stats
      const existing = agentMap.get(session.agentName);
      if (existing) {
        existing.cost += session.totalCostUsd ?? 0;
        existing.sessions += 1;
      } else {
        agentMap.set(session.agentName, {
          agentName: session.agentName,
          cost: session.totalCostUsd ?? 0,
          sessions: 1,
        });
      }

      // Model stats from streams
      for (const stream of session.streams) {
        const key = `${stream.providerId}::${stream.modelId}`;
        const ms = modelMap.get(key);
        if (ms) {
          ms.cost += stream.costUsd ?? 0;
          ms.requests += stream.requestCount;
          ms.tokens += stream.tokens.input + stream.tokens.output;
        } else {
          modelMap.set(key, {
            modelId: stream.modelId,
            providerId: stream.providerId,
            cost: stream.costUsd ?? 0,
            requests: stream.requestCount,
            tokens: stream.tokens.input + stream.tokens.output,
          });
        }
      }
    }

    project.models = Array.from(modelMap.values()).sort((a, b) => b.cost - a.cost);
    project.agents = Array.from(agentMap.values()).sort((a, b) => b.cost - a.cost);

    // Trend: bucket session costs into 5 time slices
    if (project.sessions.length > 0) {
      const minTime = Math.min(...project.sessions.map((s) => s.startedAt));
      const maxTime = Math.max(...project.sessions.map((s) => s.lastActivityAt));
      const range = maxTime - minTime;
      const bucketCount = 5;
      const trendBuckets = new Array<number>(bucketCount).fill(0);
      if (range > 0) {
        for (const s of project.sessions) {
          const idx = Math.min(
            bucketCount - 1,
            Math.floor(((s.lastActivityAt - minTime) / range) * bucketCount),
          );
          const bucket = trendBuckets[idx];
          if (bucket !== undefined) {
            trendBuckets[idx] = bucket + (s.totalCostUsd ?? 0);
          }
        }
      } else {
        trendBuckets[bucketCount - 1] = project.cost;
      }
      project.trend = trendBuckets;
    }
  }

  return Array.from(statsMap.values());
}

// ---------------------------------------------------------------------------
// Sort fields cycle
// ---------------------------------------------------------------------------

const SORT_FIELDS: SortField[] = ['cost', 'share', 'sessions', 'cache', 'cpr', 'activity'];

const SORT_LABELS: Record<SortField, string> = {
  cost: 'COST',
  share: 'SHARE',
  sessions: 'SESSIONS',
  cache: 'CACHE',
  cpr: '$/REQ',
  activity: 'ACTIVITY',
};

function sortProjects(projects: ProjectStats[], field: SortField, totalCost: number): ProjectStats[] {
  return [...projects].sort((a, b) => {
    switch (field) {
      case 'cost':
        return b.cost - a.cost;
      case 'share': {
        const shareA = totalCost > 0 ? a.cost / totalCost : 0;
        const shareB = totalCost > 0 ? b.cost / totalCost : 0;
        return shareB - shareA;
      }
      case 'sessions':
        return b.sessionCount - a.sessionCount;
      case 'cache': {
        const cacheA = (a.inputTokens + a.cacheRead) > 0 ? a.cacheRead / (a.inputTokens + a.cacheRead) : 0;
        const cacheB = (b.inputTokens + b.cacheRead) > 0 ? b.cacheRead / (b.inputTokens + b.cacheRead) : 0;
        return cacheB - cacheA;
      }
      case 'cpr': {
        const cprA = a.requestCount > 0 ? a.cost / a.requestCount : 0;
        const cprB = b.requestCount > 0 ? b.cost / b.requestCount : 0;
        return cprB - cprA;
      }
      case 'activity':
        return b.activeSessions - a.activeSessions;
      default:
        return 0;
    }
  });
}

// ---------------------------------------------------------------------------
// Responsive column layout
// ---------------------------------------------------------------------------

interface ColumnSpec {
  key: string;
  label: string;
  width: number;
  minTermWidth: number; // hide below this terminal width
}

const COLUMNS: ColumnSpec[] = [
  { key: 'project', label: 'PROJECT', width: 20, minTermWidth: 0 },
  { key: 'cost', label: 'COST', width: 8, minTermWidth: 0 },
  { key: 'share', label: 'SHARE', width: 6, minTermWidth: 80 },
  { key: 'trend', label: 'TREND', width: 7, minTermWidth: 90 },
  { key: 'sess', label: 'SESS', width: 7, minTermWidth: 0 },
  { key: 'cache', label: 'CACHE', width: 7, minTermWidth: 100 },
  { key: 'cpr', label: '$/REQ', width: 8, minTermWidth: 110 },
  { key: 'topmodel', label: 'TOP MODEL', width: 18, minTermWidth: 120 },
  { key: 'activity', label: 'ACTIVITY', width: 8, minTermWidth: 70 },
];

function getVisibleColumns(termWidth: number): ColumnSpec[] {
  return COLUMNS.filter((c) => termWidth >= c.minTermWidth);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface AggregateHeaderProps {
  totalCost: number;
  projectCount: number;
  sessionCount: number;
  windowLabel: string;
  sortField: SortField;
}

function AggregateHeader({ totalCost, projectCount, sessionCount, windowLabel, sortField }: AggregateHeaderProps) {
  const colors = useColors();
  const avgPerProject = projectCount > 0 ? totalCost / projectCount : 0;

  return (
    <box flexDirection="row" height={1} justifyContent="space-between" paddingX={1}>
      <text height={1}>
        <span fg={colors.success}><strong>{formatCost(totalCost)}</strong></span>
        <span fg={colors.textMuted}> total  </span>
        <span fg={colors.text}>{projectCount}</span>
        <span fg={colors.textMuted}> projects  </span>
        <span fg={colors.text}>{sessionCount}</span>
        <span fg={colors.textMuted}> sessions  Avg $/proj: </span>
        <span fg={colors.text}>{formatCost(avgPerProject)}</span>
      </text>
      <text height={1} fg={colors.textMuted}>
        [{windowLabel}] Sort: <span fg={colors.primary}>{SORT_LABELS[sortField]}</span>
      </text>
    </box>
  );
}

interface ProjectRowProps {
  project: ProjectStats;
  isSelected: boolean;
  totalCost: number;
  visibleColumns: ColumnSpec[];
}

function ProjectRow({ project, isSelected, totalCost, visibleColumns }: ProjectRowProps) {
  const colors = useColors();
  const fg = isSelected ? colors.primary : colors.text;
  const mutedFg = isSelected ? colors.primary : colors.textMuted;
  const subtleFg = isSelected ? colors.primary : colors.textSubtle;
  const railChar = isSelected ? '\u258C' : ' ';

  const share = totalCost > 0 ? (project.cost / totalCost) * 100 : 0;
  const cacheTotal = project.inputTokens + project.cacheRead;
  const cacheRate = cacheTotal > 0 ? (project.cacheRead / cacheTotal) * 100 : 0;
  const costPerReq = project.requestCount > 0 ? project.cost / project.requestCount : 0;
  const topModel = project.models[0];
  const topModelName = topModel ? (topModel.modelId.split('/').pop() ?? topModel.modelId) : '-';
  const topModelShare = topModel && project.cost > 0
    ? Math.round((topModel.cost / project.cost) * 100)
    : 0;
  const activityDots = project.activeSessions > 0
    ? '\u25CF'.repeat(Math.min(project.activeSessions, 5)) +
      (project.activeSessions > 5 ? `+${project.activeSessions - 5}` : '')
    : '\u25CB';

  const colRenderers: Record<string, () => React.ReactElement> = {
    project: () => (
      <text width={20} height={1} fg={fg}>
        {padRight(truncate(project.name, 19), 20)}
      </text>
    ),
    cost: () => (
      <text width={8} height={1} fg={isSelected ? colors.primary : colors.success}>
        {padLeft(formatCost(project.cost), 8)}
      </text>
    ),
    share: () => (
      <text width={6} height={1} fg={mutedFg}>
        {padLeft(formatPercent(share), 6)}
      </text>
    ),
    trend: () => (
      <text width={7} height={1} fg={subtleFg}>
        {' '}{miniSparkline(project.trend, 5)}{' '}
      </text>
    ),
    sess: () => (
      <text width={7} height={1} fg={fg}>
        {padLeft(`${project.sessionCount}/${project.activeSessions}`, 7)}
      </text>
    ),
    cache: () => (
      <text width={7} height={1} fg={cacheRate >= 50 ? (isSelected ? colors.primary : colors.success) : mutedFg}>
        {padLeft(cacheRate > 0 ? formatPercent(cacheRate) : '-', 7)}
      </text>
    ),
    cpr: () => (
      <text width={8} height={1} fg={mutedFg}>
        {padLeft(costPerReq > 0 ? formatCost(costPerReq) : '-', 8)}
      </text>
    ),
    topmodel: () => (
      <text width={18} height={1} fg={subtleFg}>
        {padRight(
          topModel
            ? `${truncate(topModelName, 12)} ${topModelShare}%`
            : '-',
          18,
        )}
      </text>
    ),
    activity: () => (
      <text width={8} height={1} fg={project.activeSessions > 0 ? (isSelected ? colors.primary : colors.success) : mutedFg}>
        {padRight(activityDots, 8)}
      </text>
    ),
  };

  return (
    <box flexDirection="row" height={1} backgroundColor={isSelected ? colors.borderMuted : undefined}>
      <text width={2} height={1} fg={isSelected ? colors.primary : colors.textSubtle}>{railChar} </text>
      {visibleColumns.map((col) => {
        const renderer = colRenderers[col.key];
        return renderer ? <box key={col.key}>{renderer()}</box> : null;
      })}
    </box>
  );
}

interface SummaryFooterProps {
  projects: ProjectStats[];
  visibleColumns: ColumnSpec[];
}

function SummaryFooter({ projects, visibleColumns }: SummaryFooterProps) {
  const colors = useColors();
  const totalCost = projects.reduce((s, p) => s + p.cost, 0);
  const totalSessions = projects.reduce((s, p) => s + p.sessionCount, 0);
  const totalActive = projects.reduce((s, p) => s + p.activeSessions, 0);
  const totalRequests = projects.reduce((s, p) => s + p.requestCount, 0);
  const totalInput = projects.reduce((s, p) => s + p.inputTokens, 0);
  const totalCacheRead = projects.reduce((s, p) => s + p.cacheRead, 0);
  const cacheTotal = totalInput + totalCacheRead;
  const cacheRate = cacheTotal > 0 ? (totalCacheRead / cacheTotal) * 100 : 0;
  const avgCpr = totalRequests > 0 ? totalCost / totalRequests : 0;

  const colRenderers: Record<string, () => React.ReactElement> = {
    project: () => (
      <text width={20} height={1} fg={colors.textMuted}>
        {padRight('TOTAL', 20)}
      </text>
    ),
    cost: () => (
      <text width={8} height={1} fg={colors.success}>
        {padLeft(formatCost(totalCost), 8)}
      </text>
    ),
    share: () => (
      <text width={6} height={1} fg={colors.textMuted}>
        {padLeft('100%', 6)}
      </text>
    ),
    trend: () => (
      <text width={7} height={1} fg={colors.textSubtle}>
        {'       '}
      </text>
    ),
    sess: () => (
      <text width={7} height={1} fg={colors.text}>
        {padLeft(`${totalSessions}/${totalActive}`, 7)}
      </text>
    ),
    cache: () => (
      <text width={7} height={1} fg={cacheRate >= 50 ? colors.success : colors.textMuted}>
        {padLeft(formatPercent(cacheRate), 7)}
      </text>
    ),
    cpr: () => (
      <text width={8} height={1} fg={colors.textMuted}>
        {padLeft(formatCost(avgCpr), 8)}
      </text>
    ),
    topmodel: () => (
      <text width={18} height={1} fg={colors.textSubtle}>
        {'                  '}
      </text>
    ),
    activity: () => (
      <text width={8} height={1} fg={totalActive > 0 ? colors.success : colors.textMuted}>
        {padRight(totalActive > 0 ? `${totalActive} live` : 'idle', 8)}
      </text>
    ),
  };

  return (
    <box flexDirection="row" height={1}>
      <text width={2} height={1} fg={colors.border}>{'\u2500 '}</text>
      {visibleColumns.map((col) => {
        const renderer = colRenderers[col.key];
        return renderer ? <box key={col.key}>{renderer()}</box> : null;
      })}
    </box>
  );
}

// ---------------------------------------------------------------------------
// Cross-Project Insights Panel
// ---------------------------------------------------------------------------

interface InsightsPanelProps {
  projects: ProjectStats[];
  termWidth: number;
}

function InsightsPanel({ projects, termWidth }: InsightsPanelProps) {
  const colors = useColors();

  // Aggregate model costs across all projects
  const modelCosts = useMemo(() => {
    const map = new Map<string, { name: string; cost: number }>();
    for (const p of projects) {
      for (const m of p.models) {
        const name = m.modelId.split('/').pop() ?? m.modelId;
        const existing = map.get(name);
        if (existing) {
          existing.cost += m.cost;
        } else {
          map.set(name, { name, cost: m.cost });
        }
      }
    }
    return Array.from(map.values())
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 5);
  }, [projects]);

  // Aggregate agent costs across all projects
  const agentCosts = useMemo(() => {
    const map = new Map<string, { name: string; cost: number }>();
    for (const p of projects) {
      for (const a of p.agents) {
        const existing = map.get(a.agentName);
        if (existing) {
          existing.cost += a.cost;
        } else {
          map.set(a.agentName, { name: a.agentName, cost: a.cost });
        }
      }
    }
    return Array.from(map.values())
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 5);
  }, [projects]);

  // Efficiency rankings
  const rankings = useMemo(() => {
    if (projects.length === 0) return null;
    const bestCpr = [...projects]
      .filter((p) => p.requestCount > 0)
      .sort((a, b) => (a.cost / a.requestCount) - (b.cost / b.requestCount))[0];
    const bestCache = [...projects]
      .filter((p) => (p.inputTokens + p.cacheRead) > 0)
      .sort((a, b) => {
        const rateB = b.cacheRead / (b.inputTokens + b.cacheRead);
        const rateA = a.cacheRead / (a.inputTokens + a.cacheRead);
        return rateB - rateA;
      })[0];
    const mostActive = [...projects].sort((a, b) => b.activeSessions - a.activeSessions)[0];

    // Biggest mover: project with highest cost in the latest trend bucket vs average
    let biggestMover: ProjectStats | undefined;
    let biggestMoverDelta = 0;
    for (const p of projects) {
      if (p.trend.length >= 2) {
        const last = p.trend[p.trend.length - 1] ?? 0;
        const avg = p.trend.reduce((s, v) => s + v, 0) / p.trend.length;
        const delta = avg > 0 ? (last - avg) / avg : 0;
        if (Math.abs(delta) > Math.abs(biggestMoverDelta)) {
          biggestMoverDelta = delta;
          biggestMover = p;
        }
      }
    }

    return { bestCpr, bestCache, mostActive, biggestMover, biggestMoverDelta };
  }, [projects]);

  const maxModelCost = modelCosts.length > 0 ? modelCosts[0]!.cost : 1;
  const maxAgentCost = agentCosts.length > 0 ? agentCosts[0]!.cost : 1;

  const isWide = termWidth >= 120;
  const barWidth = isWide ? 15 : 10;
  const nameWidth = isWide ? 16 : 12;

  return (
    <box
      flexDirection="column"
      border
      borderStyle="single"
      borderColor={colors.border}
      overflow="hidden"
      flexShrink={0}
    >
      <box flexDirection="row" paddingX={1} height={1}>
        <text height={1} fg={colors.textMuted}><strong>CROSS-PROJECT INSIGHTS</strong></text>
        <text flexGrow={1} height={1}>{' '}</text>
        <text height={1} fg={colors.textSubtle}>[v] toggle</text>
      </box>

      <box flexDirection="row" paddingX={1} gap={2} overflow="hidden">
        {/* COST BY MODEL */}
        <box flexDirection="column" flexGrow={1} overflow="hidden">
          <text height={1} fg={colors.textMuted}><strong>COST BY MODEL</strong></text>
          {modelCosts.map((m: { name: string; cost: number }) => (
            <box key={m.name} flexDirection="row" height={1}>
              <text width={nameWidth} height={1} fg={colors.text}>
                {padRight(truncate(m.name, nameWidth - 1), nameWidth)}
              </text>
              <text width={barWidth} height={1} fg={colors.primary}>
                {makeBar((m.cost / maxModelCost) * 100, barWidth)}
              </text>
              <text width={8} height={1} fg={colors.textMuted}>
                {padLeft(formatCost(m.cost), 8)}
              </text>
            </box>
          ))}
          {modelCosts.length === 0 && (
            <text height={1} fg={colors.textSubtle}>No model data</text>
          )}
        </box>

        {/* COST BY AGENT */}
        <box flexDirection="column" flexGrow={1} overflow="hidden">
          <text height={1} fg={colors.textMuted}><strong>COST BY AGENT</strong></text>
          {agentCosts.map((a: { name: string; cost: number }) => (
            <box key={a.name} flexDirection="row" height={1}>
              <text width={nameWidth} height={1} fg={colors.text}>
                {padRight(truncate(a.name, nameWidth - 1), nameWidth)}
              </text>
              <text width={barWidth} height={1} fg={colors.accent}>
                {makeBar((a.cost / maxAgentCost) * 100, barWidth)}
              </text>
              <text width={8} height={1} fg={colors.textMuted}>
                {padLeft(formatCost(a.cost), 8)}
              </text>
            </box>
          ))}
          {agentCosts.length === 0 && (
            <text height={1} fg={colors.textSubtle}>No agent data</text>
          )}
        </box>

        {/* EFFICIENCY + BIGGEST MOVER */}
        {isWide && rankings && (
          <box flexDirection="column" width={30} overflow="hidden">
            <text height={1} fg={colors.textMuted}><strong>RANKINGS</strong></text>
            {rankings.bestCpr && (
              <text height={1} fg={colors.textSubtle}>
                Best $/req: <span fg={colors.success}>{truncate(rankings.bestCpr.name, 10)}</span>
                {' '}{formatCost(rankings.bestCpr.cost / rankings.bestCpr.requestCount)}
              </text>
            )}
            {rankings.bestCache && (
              <text height={1} fg={colors.textSubtle}>
                Best cache: <span fg={colors.success}>{truncate(rankings.bestCache.name, 10)}</span>
                {' '}{formatPercent(rankings.bestCache.cacheRead / (rankings.bestCache.inputTokens + rankings.bestCache.cacheRead) * 100)}
              </text>
            )}
            {rankings.mostActive && rankings.mostActive.activeSessions > 0 && (
              <text height={1} fg={colors.textSubtle}>
                Most active: <span fg={colors.success}>{truncate(rankings.mostActive.name, 10)}</span>
                {' '}{rankings.mostActive.activeSessions} live
              </text>
            )}
            {rankings.biggestMover && (
              <text height={1} fg={colors.textSubtle}>
                Biggest mover: <span fg={rankings.biggestMoverDelta >= 0 ? colors.warning : colors.info}>
                  {truncate(rankings.biggestMover.name, 8)}
                </span>
                {' '}{rankings.biggestMoverDelta >= 0 ? '\u25B2' : '\u25BC'}{formatPercent(Math.abs(rankings.biggestMoverDelta) * 100)}
              </text>
            )}
          </box>
        )}
      </box>
    </box>
  );
}

// ---------------------------------------------------------------------------
// Project Detail Drawer
// ---------------------------------------------------------------------------

interface ProjectDetailDrawerProps {
  project: ProjectStats;
  totalCost: number;
  onClose: () => void;
}

function ProjectDetailDrawer({ project, totalCost, onClose: _onClose }: ProjectDetailDrawerProps) {
  void _onClose;
  const colors = useColors();
  const { width: termWidth, height: termHeight } = useTerminalDimensions();

  const width = Math.max(70, Math.min(termWidth - 4, 100));
  const height = Math.max(24, Math.min(termHeight - 4, 42));
  const contentWidth = width - 4;

  const share = totalCost > 0 ? (project.cost / totalCost) * 100 : 0;
  const cacheTotal = project.inputTokens + project.cacheRead;
  const cacheRate = cacheTotal > 0 ? (project.cacheRead / cacheTotal) * 100 : 0;
  const outputShare = (project.inputTokens + project.outputTokens) > 0
    ? (project.outputTokens / (project.inputTokens + project.outputTokens)) * 100
    : 0;
  const costPerReq = project.requestCount > 0 ? project.cost / project.requestCount : 0;
  const avgPerSession = project.sessionCount > 0 ? project.cost / project.sessionCount : 0;
  const allTokens = project.inputTokens + project.outputTokens + project.cacheRead + project.cacheWrite;

  // Token composition percentages
  const inputPct = allTokens > 0 ? (project.inputTokens / allTokens) * 100 : 0;
  const outputPct = allTokens > 0 ? (project.outputTokens / allTokens) * 100 : 0;
  const cacheReadPct = allTokens > 0 ? (project.cacheRead / allTokens) * 100 : 0;
  const cacheWritePct = allTokens > 0 ? (project.cacheWrite / allTokens) * 100 : 0;

  const compBarW = Math.min(15, Math.max(10, contentWidth - 30));

  return (
    <box
      position="absolute"
      left={0}
      top={0}
      width="100%"
      height="100%"
      justifyContent="center"
      alignItems="center"
      zIndex={100}
      backgroundColor={OVERLAY_BG}
    >
      <box
        width={width}
        height={height}
        border
        borderStyle="double"
        borderColor={colors.primary}
        flexDirection="column"
        padding={1}
        backgroundColor={colors.background}
        overflow="hidden"
      >
        {/* Header */}
        <box flexDirection="row" justifyContent="space-between" height={1} marginBottom={1}>
          <text height={1}>
            <span fg={colors.primary}><strong>PROJECT: {truncate(project.name, 30)}</strong></span>
            <span fg={colors.textMuted}> ({formatPercent(share)} of total)</span>
          </text>
          <text height={1} fg={colors.textMuted}>[Esc] Close</text>
        </box>

        {/* Overview stats */}
        <box
          flexDirection="column"
          border
          borderStyle="single"
          borderColor={colors.border}
          paddingX={1}
          paddingY={0}
          flexShrink={0}
        >
          <box flexDirection="row" height={1} justifyContent="space-between">
            <text height={1}>
              <span fg={colors.textMuted}>Cost: </span>
              <span fg={colors.success}><strong>{formatCost(project.cost)}</strong></span>
            </text>
            <text height={1}>
              <span fg={colors.textMuted}>Sessions: </span>
              <span fg={colors.text}>{project.sessionCount}</span>
              <span fg={colors.textMuted}> (</span>
              <span fg={project.activeSessions > 0 ? colors.success : colors.textMuted}>{project.activeSessions} active</span>
              <span fg={colors.textMuted}>)</span>
            </text>
          </box>
          <box flexDirection="row" height={1} justifyContent="space-between">
            <text height={1}>
              <span fg={colors.textMuted}>Tokens: </span>
              <span fg={colors.text}>{formatTokensCompact(project.tokens)}</span>
              <span fg={colors.textMuted}> (In: {formatTokensCompact(project.inputTokens)} / Out: {formatTokensCompact(project.outputTokens)})</span>
            </text>
            <text height={1}>
              <span fg={colors.textMuted}>Requests: </span>
              <span fg={colors.text}>{project.requestCount}</span>
            </text>
          </box>
        </box>

        {/* MODEL BREAKDOWN */}
        <box flexDirection="row" height={1} paddingX={1} marginTop={0}>
          <text flexGrow={1} height={1} fg={colors.primary}><strong>MODEL</strong></text>
          <box width={8} justifyContent="flex-end"><text fg={colors.primary}><strong>COST</strong></text></box>
          <box width={6} justifyContent="flex-end"><text fg={colors.primary}><strong>SHARE</strong></text></box>
          <box width={8} justifyContent="flex-end"><text fg={colors.primary}><strong>REQS</strong></text></box>
        </box>
        <box flexDirection="column" border borderColor={colors.border} overflow="hidden" flexShrink={0}>
          <scrollbox flexGrow={1}>
            {project.models.length > 0 ? project.models.slice(0, 8).map((m, idx) => {
              const modelName = m.modelId.split('/').pop() ?? m.modelId;
              const modelShare = project.cost > 0 ? (m.cost / project.cost) * 100 : 0;
              return (
                <box key={`${m.modelId}-${idx}`} flexDirection="row" height={1} paddingX={1}>
                  <text flexGrow={1} height={1} fg={colors.text} overflow="hidden">
                    {truncate(modelName, contentWidth - 28)}
                  </text>
                  <box width={8} height={1} justifyContent="flex-end">
                    <text fg={colors.success}>{formatCost(m.cost)}</text>
                  </box>
                  <box width={6} height={1} justifyContent="flex-end">
                    <text fg={colors.textMuted}>{formatPercent(modelShare)}</text>
                  </box>
                  <box width={8} height={1} justifyContent="flex-end">
                    <text fg={colors.textMuted}>{m.requests}</text>
                  </box>
                </box>
              );
            }) : (
              <text height={1} paddingX={1} fg={colors.textSubtle}>No model data</text>
            )}
          </scrollbox>
        </box>

        {/* SESSIONS */}
        <box flexDirection="row" height={1} paddingX={1} marginTop={0}>
          <text flexGrow={1} height={1} fg={colors.primary}><strong>SESSIONS</strong></text>
          <box width={8} justifyContent="flex-end"><text fg={colors.primary}><strong>COST</strong></text></box>
          <box width={8} justifyContent="flex-end"><text fg={colors.primary}><strong>TOKENS</strong></text></box>
          <box width={6} justifyContent="flex-end"><text fg={colors.primary}><strong>AGO</strong></text></box>
          <box width={2} justifyContent="flex-end"><text fg={colors.primary}> </text></box>
        </box>
        <box flexDirection="column" border borderColor={colors.border} overflow="hidden" flexGrow={1}>
          <scrollbox flexGrow={1}>
            {project.sessions
              .sort((a, b) => b.lastActivityAt - a.lastActivityAt)
              .slice(0, 15)
              .map((s) => {
                const modelName = s.streams[0]?.modelId.split('/').pop() ?? 'unknown';
                return (
                  <box key={s.sessionId} flexDirection="row" height={1} paddingX={1}>
                    <text width={10} height={1} fg={colors.textSubtle} overflow="hidden">
                      {padRight(truncate(s.agentName, 9), 10)}
                    </text>
                    <text flexGrow={1} height={1} fg={colors.text} overflow="hidden">
                      {truncate(modelName, contentWidth - 40)}
                    </text>
                    <box width={8} height={1} justifyContent="flex-end">
                      <text fg={colors.success}>{formatCost(s.totalCostUsd ?? 0)}</text>
                    </box>
                    <box width={8} height={1} justifyContent="flex-end">
                      <text fg={colors.textMuted}>{formatTokensCompact(s.totals.input + s.totals.output)}</text>
                    </box>
                    <box width={6} height={1} justifyContent="flex-end">
                      <text fg={colors.textMuted}>{formatRelativeTime(s.lastActivityAt)}</text>
                    </box>
                    <box width={2} height={1} justifyContent="flex-end">
                      <text fg={s.status === 'active' ? colors.success : colors.textMuted}>
                        {s.status === 'active' ? '\u25CF' : '\u25CB'}
                      </text>
                    </box>
                  </box>
                );
              })}
            {project.sessions.length === 0 && (
              <text height={1} paddingX={1} fg={colors.textSubtle}>No sessions</text>
            )}
          </scrollbox>
        </box>

        {/* EFFICIENCY + TOKEN COMPOSITION */}
        <box flexDirection="row" gap={1} flexShrink={0} marginTop={0}>
          {/* Efficiency */}
          <box flexDirection="column" flexGrow={1} border borderColor={colors.border} paddingX={1} overflow="hidden">
            <text height={1} fg={colors.primary}><strong>EFFICIENCY</strong></text>
            <text height={1}>
              <span fg={colors.textMuted}>Cache leverage: </span>
              <span fg={cacheRate >= 50 ? colors.success : colors.warning}>{formatPercent(cacheRate)}</span>
            </text>
            <text height={1}>
              <span fg={colors.textMuted}>Output share:   </span>
              <span fg={outputShare > 65 ? colors.warning : colors.text}>{formatPercent(outputShare)}</span>
            </text>
            <text height={1}>
              <span fg={colors.textMuted}>$/request:      </span>
              <span fg={colors.text}>{formatCost(costPerReq)}</span>
            </text>
            <text height={1}>
              <span fg={colors.textMuted}>Avg/session:    </span>
              <span fg={colors.text}>{formatCost(avgPerSession)}</span>
            </text>
          </box>

          {/* Token composition */}
          <box flexDirection="column" flexGrow={1} border borderColor={colors.border} paddingX={1} overflow="hidden">
            <text height={1} fg={colors.primary}><strong>TOKEN COMPOSITION</strong></text>
            <box flexDirection="row" height={1}>
              <text width={12} height={1} fg={colors.textMuted}>Input     </text>
              <text width={compBarW} height={1} fg={colors.info}>{makeBar(inputPct, compBarW)}</text>
              <text height={1} fg={colors.text}> {formatPercent(inputPct)}</text>
            </box>
            <box flexDirection="row" height={1}>
              <text width={12} height={1} fg={colors.textMuted}>Output    </text>
              <text width={compBarW} height={1} fg={colors.warning}>{makeBar(outputPct, compBarW)}</text>
              <text height={1} fg={colors.text}> {formatPercent(outputPct)}</text>
            </box>
            <box flexDirection="row" height={1}>
              <text width={12} height={1} fg={colors.textMuted}>Cache read</text>
              <text width={compBarW} height={1} fg={colors.success}>{makeBar(cacheReadPct, compBarW)}</text>
              <text height={1} fg={colors.text}> {formatPercent(cacheReadPct)}</text>
            </box>
            {cacheWritePct > 0 && (
              <box flexDirection="row" height={1}>
                <text width={12} height={1} fg={colors.textMuted}>Cache writ</text>
                <text width={compBarW} height={1} fg={colors.accent}>{makeBar(cacheWritePct, compBarW)}</text>
                <text height={1} fg={colors.text}> {formatPercent(cacheWritePct)}</text>
              </box>
            )}
          </box>
        </box>
      </box>
    </box>
  );
}

// ---------------------------------------------------------------------------
// Empty State
// ---------------------------------------------------------------------------

function EmptyState({ hasFilter }: { hasFilter: boolean }) {
  const colors = useColors();

  if (hasFilter) {
    return (
      <box flexGrow={1} justifyContent="center" alignItems="center" flexDirection="column" gap={1}>
        <text fg={colors.textMuted}>No projects match your filter.</text>
        <text fg={colors.textSubtle}>Press Esc to clear the filter.</text>
      </box>
    );
  }

  return (
    <box flexGrow={1} justifyContent="center" alignItems="center" flexDirection="column" gap={1}>
      <text fg={colors.textMuted}>No projects found in this time window.</text>
      <text fg={colors.textSubtle}>Projects appear when coding agents report sessions.</text>
      <text fg={colors.textSubtle}>Try a wider time window (t) or check the Dashboard (1).</text>
    </box>
  );
}

// ---------------------------------------------------------------------------
// Main View
// ---------------------------------------------------------------------------

export function ProjectsView() {
  const { sessions, isLoading } = useAgentSessions();
  const colors = useColors();
  const { windowLabel, getWindowStart, cycleWindow } = useTimeWindow();
  const { width: termWidth, height: termHeight } = useTerminalDimensions();
  const { setInputFocused } = useInputFocus();

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [sortField, setSortField] = useState<SortField>('cost');
  const [showInsights, setShowInsights] = useState(false);
  const [drawerProject, setDrawerProject] = useState<ProjectStats | null>(null);
  const [filterQuery, setFilterQuery] = useState('');
  const [isFiltering, setIsFiltering] = useState(false);

  // Aggregate projects
  const projectStats = useMemo(
    () => aggregateProjects(sessions, getWindowStart()),
    [sessions, getWindowStart],
  );

  const totalCost: number = useMemo(
    () => projectStats.reduce((s: number, p: ProjectStats) => s + p.cost, 0),
    [projectStats],
  );

  const totalSessions = useMemo(
    () => projectStats.reduce((s: number, p: ProjectStats) => s + p.sessionCount, 0),
    [projectStats],
  );

  // Filter
  const filteredProjects = useMemo(() => {
    if (!filterQuery) return projectStats;
    const q = filterQuery.toLowerCase();
    return projectStats.filter(
      (p: ProjectStats) =>
        p.name.toLowerCase().includes(q) || p.path.toLowerCase().includes(q),
    );
  }, [projectStats, filterQuery]);

  // Sort
  const sortedProjects = useMemo(
    () => sortProjects(filteredProjects, sortField, totalCost),
    [filteredProjects, sortField, totalCost],
  );

  // Visible columns
  const visibleColumns: ColumnSpec[] = useMemo(() => getVisibleColumns(termWidth), [termWidth]);

  // Clamp selection
  useEffect(() => {
    if (sortedProjects.length === 0) {
      if (selectedIndex !== 0) setSelectedIndex(0);
    } else if (selectedIndex >= sortedProjects.length) {
      setSelectedIndex(sortedProjects.length - 1);
    }
  }, [sortedProjects.length, selectedIndex]);

  // Input focus sync
  useEffect(() => {
    setInputFocused(isFiltering);
    return () => setInputFocused(false);
  }, [isFiltering, setInputFocused]);

  // Keyboard handler
  useKeyboard(
    useCallback(
      (key: { name: string; shift?: boolean; ctrl?: boolean }) => {
        // Drawer open: only Esc closes
        if (drawerProject) {
          if (key.name === 'escape') {
            setDrawerProject(null);
          }
          return;
        }

        // Filter mode
        if (isFiltering) {
          if (key.name === 'escape') {
            setIsFiltering(false);
            setFilterQuery('');
          } else if (key.name === 'enter' || key.name === 'return') {
            setIsFiltering(false);
          }
          return;
        }

        // Navigation
        if (key.name === 'down' || key.name === 'j') {
          setSelectedIndex((prev: number) => Math.min(prev + 1, sortedProjects.length - 1));
        } else if (key.name === 'up' || key.name === 'k') {
          setSelectedIndex((prev: number) => Math.max(prev - 1, 0));
        }
        // Sort cycling
        else if (key.name === 's') {
          setSortField((prev: SortField) => {
            const idx = SORT_FIELDS.indexOf(prev);
            return SORT_FIELDS[(idx + 1) % SORT_FIELDS.length]!;
          });
        }
        // Time window
        else if (key.name === 't') {
          cycleWindow();
        }
        // Toggle insights panel
        else if (key.name === 'v') {
          setShowInsights((prev: boolean) => !prev);
        }
        // Open detail drawer
        else if (key.name === 'enter' || key.name === 'return') {
          const project = sortedProjects[selectedIndex];
          if (project) {
            setDrawerProject(project);
          }
        }
        // Filter
        else if (key.name === '/' || key.name === 'f') {
          setIsFiltering(true);
        }
        // Clear filter
        else if (key.name === 'escape') {
          if (filterQuery) {
            setFilterQuery('');
          }
        }
        // Jump to top/bottom
        else if (key.name === 'g') {
          setSelectedIndex(0);
        }
        else if (key.name === 'G' || (key.name === 'g' && key.shift)) {
          setSelectedIndex(Math.max(0, sortedProjects.length - 1));
        }
      },
      [drawerProject, isFiltering, sortedProjects, selectedIndex, cycleWindow, filterQuery],
    ),
  );

  // Loading state
  if (isLoading && projectStats.length === 0) {
    return (
      <box flexGrow={1} justifyContent="center" alignItems="center">
        <text fg={colors.textMuted}>Loading sessions...</text>
      </box>
    );
  }

  // Empty state
  if (sortedProjects.length === 0 && !isLoading) {
    return (
      <box flexDirection="column" flexGrow={1} padding={1}>
        <EmptyState hasFilter={filterQuery.length > 0} />
        <box flexDirection="row" height={1} paddingLeft={1}>
          <text fg={colors.textSubtle}>
            {filterQuery ? 'Esc clear filter  / edit filter  t time window' : 't time window  / filter'}
          </text>
        </box>
      </box>
    );
  }

  return (
    <box flexDirection="column" flexGrow={1} padding={1} overflow="hidden">
      {/* Drawer overlay */}
      {drawerProject && (
        <ProjectDetailDrawer
          project={drawerProject}
          totalCost={totalCost}
          onClose={() => setDrawerProject(null)}
        />
      )}

      {/* Aggregate header */}
      <AggregateHeader
        totalCost={totalCost}
        projectCount={filteredProjects.length}
        sessionCount={totalSessions}
        windowLabel={windowLabel}
        sortField={sortField}
      />

      {/* Column headers */}
      <box flexDirection="row" height={1} marginTop={0}>
        <text width={2} height={1} fg={colors.textMuted}>{' '}</text>
        {visibleColumns.map((col: ColumnSpec) => (
          <text key={col.key} width={col.width} height={1} fg={colors.textMuted}>
            {padRight(col.label, col.width)}
          </text>
        ))}
      </box>

      {/* Filter bar (when active) */}
      {isFiltering && (
        <box flexDirection="row" height={1} paddingX={1}>
          <text fg={colors.primary}>Filter: </text>
          <input
            value={filterQuery}
            onInput={(value: string) => setFilterQuery(value)}
            focused={isFiltering}
            width={30}
            backgroundColor={colors.background}
            textColor={colors.text}
            cursorColor={colors.primary}
          />
          <text fg={colors.textSubtle}> (esc clear  enter apply)</text>
        </box>
      )}

      {/* Table body */}
      <box
        flexDirection="column"
        flexGrow={1}
        border
        borderStyle="single"
        borderColor={colors.border}
        overflow="hidden"
      >
        <scrollbox flexGrow={1}>
          <box flexDirection="column">
            {sortedProjects.map((project: ProjectStats, index: number) => (
              <ProjectRow
                key={project.path}
                project={project}
                isSelected={index === selectedIndex}
                totalCost={totalCost}
                visibleColumns={visibleColumns}
              />
            ))}
          </box>
        </scrollbox>

        {/* Summary footer */}
        <SummaryFooter projects={sortedProjects} visibleColumns={visibleColumns} />
      </box>

      {/* Cross-Project Insights Panel */}
      {showInsights && termHeight >= 30 && (
        <InsightsPanel projects={filteredProjects} termWidth={termWidth} />
      )}

      {/* Footer hints */}
      <box flexDirection="row" height={1} paddingLeft={1} flexShrink={0}>
        <text fg={colors.textSubtle} height={1}>
          {isFiltering
            ? 'Type to filter  Esc cancel  Enter apply'
            : filterQuery
              ? `Filter: "${filterQuery}"  Esc clear  / edit`
              : '\u2191\u2193 navigate  Enter details  s sort  t time  v insights  / filter'}
        </text>
      </box>
    </box>
  );
}
