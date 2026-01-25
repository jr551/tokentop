import { useState, useMemo, useEffect } from 'react';
import { useKeyboard } from '@opentui/react';
import { useAgentSessions } from '../contexts/AgentSessionContext';
import { useColors } from '../contexts/ThemeContext';
import { useTimeWindow } from '../contexts/TimeWindowContext';

type SortField = 'cost' | 'tokens' | 'sessions';

interface ProjectStats {
  path: string;
  name: string;
  sessionCount: number;
  tokens: number;
  cost: number;
}

function formatTokens(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(0) + 'K';
  }
  return num.toString();
}

function formatCost(num: number): string {
  return '$' + num.toFixed(2);
}

export function ProjectsView() {
  const { sessions, isLoading } = useAgentSessions();
  const colors = useColors();
  const { windowLabel, getWindowStart } = useTimeWindow();
  
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [sortField, setSortField] = useState<SortField>('cost');

  const projectStats = useMemo(() => {
    const windowStart = getWindowStart();
    const statsMap = new Map<string, ProjectStats>();

    sessions.forEach(session => {
      if (windowStart !== null && session.startedAt < windowStart) {
        return;
      }

      const path = session.projectPath || 'Unknown';
      const name = session.projectPath 
        ? session.projectPath.split('/').pop() || session.projectPath 
        : 'Unknown';
      
      const existing = statsMap.get(path) || {
        path,
        name,
        sessionCount: 0,
        tokens: 0,
        cost: 0
      };

      existing.sessionCount += 1;
      existing.tokens += (session.totals.input + session.totals.output);
      existing.cost += (session.totalCostUsd || 0);

      statsMap.set(path, existing);
    });

    return Array.from(statsMap.values());
  }, [sessions, getWindowStart]);

  const sortedProjects = useMemo(() => {
    return [...projectStats].sort((a, b) => {
      if (sortField === 'cost') return b.cost - a.cost;
      if (sortField === 'tokens') return b.tokens - a.tokens;
      if (sortField === 'sessions') return b.sessionCount - a.sessionCount;
      return 0;
    });
  }, [projectStats, sortField]);

  const maxCost = useMemo(() => {
    return Math.max(...projectStats.map(p => p.cost), 0);
  }, [projectStats]);

  useKeyboard((key) => {
    if (key.name === 'down' || key.name === 'j') {
      setSelectedIndex(prev => Math.min(prev + 1, sortedProjects.length - 1));
    } else if (key.name === 'up' || key.name === 'k') {
      setSelectedIndex(prev => Math.max(prev - 1, 0));
    } else if (key.name === 's') {
      setSortField(prev => {
        if (prev === 'cost') return 'tokens';
        if (prev === 'tokens') return 'sessions';
        return 'cost';
      });
    } else if (key.name === 'enter' || key.name === 'return') {
      const selected = sortedProjects[selectedIndex];
      if (selected) {
        console.log(`Selected project: ${selected.name}`);
      }
    }
  });

  useEffect(() => {
    if (selectedIndex >= sortedProjects.length && sortedProjects.length > 0) {
      setSelectedIndex(sortedProjects.length - 1);
    }
  }, [sortedProjects.length, selectedIndex]);

  if (isLoading) {
    return (
      <box flexGrow={1} justifyContent="center" alignItems="center">
        <text fg={colors.textMuted}>Loading sessions...</text>
      </box>
    );
  }

  if (sortedProjects.length === 0) {
    return (
      <box flexGrow={1} justifyContent="center" alignItems="center">
        <text fg={colors.textMuted}>No sessions found in this time window.</text>
      </box>
    );
  }

  return (
    <box flexDirection="column" flexGrow={1} padding={1}>
      <box height={1} marginBottom={1}>
        <box width={25} flexGrow={1}><text fg={colors.textMuted}>PROJECT</text></box>
        <box width={10} justifyContent="flex-end"><text fg={colors.textMuted}>SESSIONS</text></box>
        <box width={12} justifyContent="flex-end"><text fg={colors.textMuted}>TOKENS</text></box>
        <box width={15} justifyContent="flex-end">
          <text fg={colors.textMuted}>COST ({windowLabel})</text>
        </box>
        <box flexGrow={1} marginLeft={2}>
           <text fg={colors.textMuted}>
             Sorted by: <span fg={colors.primary}>{sortField.toUpperCase()}</span>
           </text>
        </box>
      </box>

      <scrollbox flexGrow={1}>
        <box flexDirection="column">
          {sortedProjects.map((project, index) => {
            const isSelected = index === selectedIndex;
            const barWidth = maxCost > 0 
              ? Math.ceil((project.cost / maxCost) * 20) 
              : 0;
            const bar = '█'.repeat(barWidth);

            return (
              <box key={project.path} height={1} flexDirection="row">
                <box width={25} flexGrow={1}>
                  <text fg={isSelected ? colors.primary : colors.text}>
                    {project.name.length > 50 ? project.name.substring(0, 49) + '…' : project.name}
                  </text>
                </box>

                <box width={10} justifyContent="flex-end">
                  <text fg={isSelected ? colors.primary : colors.text}>
                    {project.sessionCount}
                  </text>
                </box>

                <box width={12} justifyContent="flex-end">
                  <text fg={isSelected ? colors.primary : colors.text}>
                    {formatTokens(project.tokens)}
                  </text>
                </box>

                <box width={15} justifyContent="flex-end">
                  <text fg={isSelected ? colors.primary : colors.text}>
                    {formatCost(project.cost)}
                  </text>
                </box>

                <box flexGrow={1} marginLeft={2}>
                  <text fg={isSelected ? colors.primary : colors.textMuted}>
                    {bar}
                  </text>
                </box>
              </box>
            );
          })}
        </box>
      </scrollbox>
    </box>
  );
}
