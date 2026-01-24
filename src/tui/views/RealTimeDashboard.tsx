import { useState, useEffect, useMemo, useRef } from 'react';
import { useKeyboard } from '@opentui/react';
import { useColors } from '../contexts/ThemeContext.tsx';
import { usePlugins } from '../contexts/PluginContext.tsx';
import { useInputFocus } from '../contexts/InputContext.tsx';

interface AgentSession {
  sessionId: string;
  agentName: 'OpenCode' | 'Claude Code' | 'Gemini CLI' | 'Cursor' | 'Windsurf';
  providerId: string;  
  modelId: string;     
  projectPath: string;
  tokens: {
    input: number;
    output: number;
    cacheRead?: number;
    cacheWrite?: number;
  };
  cost: number;        
  startedAt: number;   
  lastActivityAt: number;
  requestCount: number;
  status: 'active' | 'idle';
}

function generateMockSessions(): AgentSession[] {
  const agents = ['OpenCode', 'Claude Code', 'Gemini CLI', 'Cursor', 'Windsurf'] as const;
  const models = [
    { id: 'claude-3-7-sonnet', provider: 'anthropic', costIn: 3.0, costOut: 15.0 },
    { id: 'claude-3-5-sonnet', provider: 'anthropic', costIn: 3.0, costOut: 15.0 },
    { id: 'claude-3-haiku', provider: 'anthropic', costIn: 0.25, costOut: 1.25 },
    { id: 'gpt-4o', provider: 'openai', costIn: 2.5, costOut: 10.0 },
    { id: 'gpt-4o-mini', provider: 'openai', costIn: 0.15, costOut: 0.6 },
    { id: 'gemini-1.5-pro', provider: 'google', costIn: 1.25, costOut: 5.0 },
    { id: 'gemini-2.0-flash', provider: 'google', costIn: 0.1, costOut: 0.4 },
  ];
  
  const projects = ['~/dev/tokentop', '~/work/backend-api', '~/experiments/ui-kit', '~/personal/blog', '~/oss/react'];
  
  const sessions: AgentSession[] = [];
  const count = 4 + Math.floor(Math.random() * 5);

  for (let i = 0; i < count; i++) {
    const model = models[Math.floor(Math.random() * models.length)]!;
    const agent = agents[Math.floor(Math.random() * agents.length)]!;
    const project = projects[Math.floor(Math.random() * projects.length)]!;
    
    const input = 5000 + Math.floor(Math.random() * 150000);
    const output = 1000 + Math.floor(Math.random() * 30000);
    
    const cost = (input * model.costIn + output * model.costOut) / 1000000;
    const isActive = Math.random() > 0.6;

    sessions.push({
      sessionId: `ses_${Math.random().toString(36).substr(2, 6)}`,
      agentName: agent,
      providerId: model.provider,
      modelId: model.id,
      projectPath: project,
      tokens: { input, output },
      cost,
      startedAt: Date.now() - Math.random() * 3600000 * 4,
      lastActivityAt: isActive ? Date.now() : Date.now() - Math.random() * 60000 * 10,
      requestCount: 10 + Math.floor(Math.random() * 200),
      status: isActive ? 'active' : 'idle'
    });
  }

  return sessions.sort((a, b) => b.cost - a.cost);
}

function Sparkline({ data, width = 60, label }: { data: number[], width?: number, label?: string }) {
  const colors = useColors();
  const chars = [' ', '▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
  
  const max = Math.max(...data, 1);
  const normalized = data.map(v => Math.min(8, Math.floor((v / max) * 8)));
  
  const displayData = normalized.slice(-width);
  const padding = width - displayData.length;
  
  const groups: { color: string; chars: string }[] = [];
  for (const v of displayData) {
    const color = v > 6 ? colors.error : v > 3 ? colors.warning : colors.success;
    const char = chars[v] ?? ' ';
    if (groups.length > 0 && groups[groups.length - 1]!.color === color) {
      groups[groups.length - 1]!.chars += char;
    } else {
      groups.push({ color, chars: char });
    }
  }
  
  return (
    <box flexDirection="column">
      <text>
        {padding > 0 && <span>{' '.repeat(padding)}</span>}
        {groups.map((group, i) => (
          <span key={i} fg={group.color}>{group.chars}</span>
        ))}
      </text>
      {label && <text fg={colors.textMuted}>{label}</text>}
    </box>
  );
}

function LimitGauge({ 
  label, 
  usedPercent, 
  color,
  ghost = false,
}: { 
  label: string; 
  usedPercent: number | null; 
  color: string;
  ghost?: boolean;
}) {
  const colors = useColors();
  const barWidth = 10;
  
  if (ghost) {
    const ghostLabel = label.length > 10 ? label.slice(0, 9) + '…' : label.padEnd(10);
    return (
      <box width={30} overflow="hidden">
        <text>
          <span fg={colors.textSubtle}> ○ </span>
          <span fg={colors.textSubtle}>{ghostLabel} </span>
          <span fg={colors.textSubtle}>{'░'.repeat(barWidth)}</span>
          <span fg={colors.textSubtle}> N/A</span>
        </text>
      </box>
    );
  }
  
  const percent = usedPercent ?? 0;
  const filled = Math.min(barWidth, Math.round((percent / 100) * barWidth));
  const empty = barWidth - filled;
  
  const isCritical = percent >= 95;
  const isWarning = percent >= 80;
  
  const barColor = isCritical ? colors.error : isWarning ? colors.warning : color;
  const statusIcon = isCritical ? '!!' : isWarning ? ' !' : ' ●';
  const statusColor = isCritical ? colors.error : isWarning ? colors.warning : colors.success;
  
  const displayLabel = label.length > 10 ? label.slice(0, 9) + '…' : label.padEnd(10);
  const percentStr = usedPercent !== null ? `${Math.round(percent)}%`.padStart(3) : ' --';
  
  return (
    <box width={30} overflow="hidden">
      <text>
        <span fg={statusColor}>{statusIcon} </span>
        <span fg={colors.text}>{displayLabel} </span>
        <span fg={barColor}>{'█'.repeat(filled)}</span>
        <span fg={colors.textSubtle}>{'░'.repeat(empty)}</span>
        <span fg={isCritical ? colors.error : colors.textMuted}> {percentStr}</span>
      </text>
    </box>
  );
}

const KPICard = ({ title, value, delta, subValue, highlight = false }: any) => {
  const colors = useColors();
  return (
    <box 
      flexDirection="column" 
      paddingLeft={1}
      paddingRight={1}
      border 
      borderStyle={highlight ? "double" : "single"}
      borderColor={highlight ? colors.primary : colors.border}
      width={18}
    >
      <text fg={colors.textMuted}>{title}</text>
      <text fg={highlight ? colors.primary : colors.text}><strong>{value}</strong></text>
      {delta && <text fg={colors.textMuted}>{delta}</text>}
      {subValue && <text fg={colors.textMuted}>{subValue}</text>}
    </box>
  );
};

function HelpOverlay() {
  const colors = useColors();
  return (
    <box 
      position="absolute" 
      top="20%" 
      left="30%" 
      width={50} 
      height={20} 
      border 
      borderStyle="double" 
      borderColor={colors.primary} 
      flexDirection="column" 
      padding={1} 
      zIndex={10}
      backgroundColor={colors.background}
    >
      <box justifyContent="center"><text><strong>Help</strong></text></box>
      
      <box marginTop={1}><text fg={colors.primary}><strong>Navigation</strong></text></box>
      <box flexDirection="row"><text width={12} fg={colors.textSubtle}>Tab</text><text>Switch panel focus</text></box>
      <box flexDirection="row"><text width={12} fg={colors.textSubtle}>↑/↓ j/k</text><text>Navigate sessions</text></box>
      <box flexDirection="row"><text width={12} fg={colors.textSubtle}>Enter</text><text>View details</text></box>
      
      <box marginTop={1}><text fg={colors.primary}><strong>Actions</strong></text></box>
      <box flexDirection="row"><text width={12} fg={colors.textSubtle}>/</text><text>Filter sessions</text></box>
      <box flexDirection="row"><text width={12} fg={colors.textSubtle}>s</text><text>Toggle sort</text></box>
      <box flexDirection="row"><text width={12} fg={colors.textSubtle}>i</text><text>Toggle sidebar</text></box>
      <box flexDirection="row"><text width={12} fg={colors.textSubtle}>r</text><text>Refresh data</text></box>
      
      <box marginTop={1}><text fg={colors.primary}><strong>General</strong></text></box>
      <box flexDirection="row"><text width={12} fg={colors.textSubtle}>1</text><text>Dashboard tab</text></box>
      <box flexDirection="row"><text width={12} fg={colors.textSubtle}>2</text><text>Providers tab</text></box>
      <box flexDirection="row"><text width={12} fg={colors.textSubtle}>q</text><text>Quit</text></box>
      
      <box justifyContent="center" marginTop={1}><text fg={colors.textMuted}>Press ? or Esc to close</text></box>
    </box>
  );
}

export function RealTimeDashboard() {
  const colors = useColors();
  const { providers } = usePlugins();
  const { setInputFocused } = useInputFocus();
  
  // Data State
  const [sessions, setSessions] = useState<AgentSession[]>([]);
  const [sparkData, setSparkData] = useState<number[]>([]);
  
  // UI State
  const [showHelp, setShowHelp] = useState(false);
  const [selectedRow, setSelectedRow] = useState(0);
  const [focusedPanel, setFocusedPanel] = useState<'sessions' | 'sidebar'>('sessions');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [filterQuery, setFilterQuery] = useState('');
  const [isFiltering, setIsFiltering] = useState(false);
  const [sortField, setSortField] = useState<'cost' | 'tokens' | 'time'>('cost');
  
  const historyRef = useRef<{time: number, cost: number, tokens: number}[]>([]);
  const [deltas, setDeltas] = useState({ cost: 0, tokens: 0 });
  
  const emaRef = useRef<{ lastTokens: number; lastTime: number; ema: number }>({ 
    lastTokens: 0, lastTime: Date.now(), ema: 0 
  });
  const [activity, setActivity] = useState<{ rate: number; ema: number; isSpike: boolean }>({ 
    rate: 0, ema: 0, isSpike: false 
  });

  const configuredProviders = useMemo(() => {
    return Array.from(providers.values())
      .filter(p => p.configured)
      .sort((a, b) => getMaxUsedPercent(b) - getMaxUsedPercent(a));
  }, [providers]);

  function getMaxUsedPercent(provider: any): number {
    if (!provider.usage?.limits) return 0;
    const items = provider.usage.limits.items ?? [];
    if (items.length > 0) return Math.max(...items.map((i: any) => i.usedPercent ?? 0));
    const primary = provider.usage.limits.primary?.usedPercent ?? 0;
    const secondary = provider.usage.limits.secondary?.usedPercent ?? 0;
    return Math.max(primary, secondary);
  }

  const getProviderColor = (id: string) => {
    if (id.includes('anthropic') || id.includes('claude')) return '#d97757';
    if (id.includes('openai') || id.includes('codex')) return '#10a37f';
    if (id.includes('google') || id.includes('gemini')) return '#4285f4';
    if (id.includes('github') || id.includes('copilot')) return '#6e40c9';
    return colors.primary;
  };

  const formatCurrency = (val: number) => `$${val.toFixed(2)}`;
  const formatTokens = (val: number) => val > 1000000 ? `${(val/1000000).toFixed(1)}M` : `${(val/1000).toFixed(1)}K`;
  const formatRate = (val: number) => val >= 1000 ? `${(val/1000).toFixed(1)}k` : `${Math.round(val)}`;
  
  const getActivityStatus = () => {
    const { ema, isSpike } = activity;
    if (isSpike || ema >= 2000) return { label: 'SPIKE', color: colors.error };
    if (ema >= 800) return { label: 'HOT', color: colors.warning };
    if (ema >= 200) return { label: 'BUSY', color: colors.success };
    if (ema >= 50) return { label: 'LOW', color: colors.textMuted };
    return { label: 'IDLE', color: colors.textSubtle };
  };

  useEffect(() => {
    setSessions(generateMockSessions());
    setSparkData(Array.from({ length: 60 }, () => Math.floor(Math.random() * 20)));

    const interval = setInterval(() => {
      const currentTime = Date.now();
      
      setSessions(prev => {
        const newSessions = prev.map(s => {
          if (s.status === 'active' && Math.random() > 0.3) {
            const addedInput = Math.floor(Math.random() * 500);
            const addedOutput = Math.floor(Math.random() * 100);
            const addedCost = (addedInput * 3.0 + addedOutput * 15.0) / 1000000;
            return {
              ...s,
              tokens: {
                ...s.tokens,
                input: s.tokens.input + addedInput,
                output: s.tokens.output + addedOutput
              },
              cost: s.cost + addedCost,
              requestCount: s.requestCount + (Math.random() > 0.8 ? 1 : 0),
              lastActivityAt: currentTime
            };
          }
          return s;
        });

        const totalCost = newSessions.reduce((sum, s) => sum + s.cost, 0);
        const totalTokens = newSessions.reduce((sum, s) => sum + s.tokens.input + s.tokens.output, 0);
        
        historyRef.current.push({ time: currentTime, cost: totalCost, tokens: totalTokens });
        if (historyRef.current.length > 300) historyRef.current.shift();

        const fiveMinAgo = historyRef.current[0];
        if (fiveMinAgo) {
          setDeltas({
            cost: totalCost - fiveMinAgo.cost,
            tokens: totalTokens - fiveMinAgo.tokens
          });
        }

        const dt = (currentTime - emaRef.current.lastTime) / 1000;
        const deltaTokens = Math.max(0, totalTokens - emaRef.current.lastTokens);
        const rateTps = dt > 0 ? deltaTokens / dt : 0;
        
        const alpha = 2 / (10 + 1);
        const newEma = alpha * rateTps + (1 - alpha) * emaRef.current.ema;
        const isSpike = rateTps >= Math.max(800, newEma * 2) && (rateTps - newEma) >= 200;
        
        emaRef.current = { lastTokens: totalTokens, lastTime: currentTime, ema: newEma };
        setActivity({ rate: rateTps, ema: newEma, isSpike });
        
        setSparkData(d => [...d.slice(1), Math.min(100, Math.round(newEma / 10))]);

        return newSessions;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const processedSessions = useMemo(() => {
    let result = [...sessions];
    
    if (filterQuery) {
      const q = filterQuery.toLowerCase();
      result = result.filter(s => 
        s.agentName.toLowerCase().includes(q) || 
        s.modelId.toLowerCase().includes(q) ||
        s.projectPath.toLowerCase().includes(q)
      );
    }

    result.sort((a, b) => {
      if (sortField === 'cost') return b.cost - a.cost;
      if (sortField === 'tokens') return (b.tokens.input + b.tokens.output) - (a.tokens.input + a.tokens.output);
      return b.lastActivityAt - a.lastActivityAt;
    });

    return result;
  }, [sessions, filterQuery, sortField]);

  useKeyboard((key) => {
    if (key.sequence === '?' || (key.shift && key.name === '/')) {
      setShowHelp(prev => !prev);
      return;
    }

    if (showHelp) {
      if (key.name === 'escape' || key.name === 'q' || key.sequence === '?') {
        setShowHelp(false);
      }
      return;
    }

    if (isFiltering) {
      if (key.name === 'escape' || key.name === 'enter') {
        setIsFiltering(false);
        setInputFocused(false);
        return;
      }
      if (key.name === 'backspace') {
        setFilterQuery(q => q.slice(0, -1));
        return;
      }
      if (key.sequence && key.sequence.length === 1 && /^[a-zA-Z0-9\-_./]$/.test(key.sequence)) {
        setFilterQuery(q => q + key.sequence);
        return;
      }
      return;
    }

    if (key.name === 'tab') {
      setFocusedPanel(curr => curr === 'sessions' ? 'sidebar' : 'sessions');
      return;
    }

    if (key.name === 'i') {
      setSidebarCollapsed(curr => !curr);
      return;
    }

    if (key.name === '/' || key.sequence === '/') {
      setIsFiltering(true);
      setInputFocused(true);
      return;
    }
    
    if (key.name === 's') {
      setSortField(curr => curr === 'cost' ? 'tokens' : 'cost');
    }

    if (focusedPanel === 'sessions') {
      if (key.name === 'down' || key.name === 'j') {
        setSelectedRow(curr => Math.min(curr + 1, processedSessions.length - 1));
      } else if (key.name === 'up' || key.name === 'k') {
        setSelectedRow(curr => Math.max(curr - 1, 0));
      }
    }
  });

  const totalCost = sessions.reduce((acc, s) => acc + s.cost, 0);
  const totalTokens = sessions.reduce((acc, s) => acc + s.tokens.input + s.tokens.output, 0);
  const totalRequests = sessions.reduce((acc, s) => acc + s.requestCount, 0);
  const activeCount = sessions.filter(s => s.status === 'active').length;

  const modelStats = useMemo(() => {
    const stats: Record<string, number> = {};
    sessions.forEach(s => { stats[s.modelId] = (stats[s.modelId] || 0) + s.cost; });
    return Object.entries(stats).sort(([, a], [, b]) => b - a).slice(0, 5);
  }, [sessions]);

  const providerStats = useMemo(() => {
    const stats: Record<string, number> = {};
    sessions.forEach(s => { stats[s.providerId] = (stats[s.providerId] || 0) + s.cost; });
    return Object.entries(stats).sort(([, a], [, b]) => b - a);
  }, [sessions]);

  const maxModelCost = Math.max(...modelStats.map(([, c]) => c), 0.01);

  return (
    <box flexDirection="column" flexGrow={1} padding={1} gap={1} overflow="hidden">
      {showHelp && <HelpOverlay />}
      
      <box flexDirection="row" gap={1} height={5} flexShrink={0}>
        <KPICard 
          title="COST" 
          value={formatCurrency(totalCost)} 
          delta={`+${formatCurrency(deltas.cost)} (5m)`} 
          highlight={true}
        />
        <KPICard 
          title="TOKENS" 
          value={formatTokens(totalTokens)} 
          delta={`+${formatTokens(deltas.tokens)} (5m)`}
        />
        <KPICard 
          title="REQUESTS" 
          value={totalRequests.toLocaleString()} 
          subValue={`${activeCount} active`}
        />
        
        <box flexDirection="column" flexGrow={1} border borderStyle="single" borderColor={colors.border} paddingLeft={1} paddingRight={1}>
          <box flexDirection="row" justifyContent="space-between">
            <text fg={colors.textSubtle}>ACTIVITY</text>
            <text>
              <span fg={getActivityStatus().color}>{getActivityStatus().label}</span>
              <span fg={colors.textMuted}> {formatRate(activity.ema)}/s</span>
            </text>
          </box>
          <Sparkline data={sparkData} width={50} label="tokens/s (60s)" />
        </box>
      </box>

      <box flexDirection="column" border borderStyle="single" padding={1} borderColor={colors.border} overflow="hidden" height={5} flexShrink={0}>
        <text fg={colors.textSubtle} marginBottom={0}>PROVIDER LIMITS</text>
        <box flexDirection="row" flexWrap="wrap" gap={2} overflow="hidden">
          {configuredProviders.slice(0, 4).map(p => (
            <LimitGauge 
              key={p.plugin.id} 
              label={p.plugin.name} 
              usedPercent={getMaxUsedPercent(p)} 
              color={getProviderColor(p.plugin.id)} 
            />
          ))}
          {configuredProviders.length === 0 && (
            <text fg={colors.textMuted}>No providers configured with limits.</text>
          )}
        </box>
      </box>

      <box flexDirection="row" gap={1} flexGrow={1}>
        
        <box 
          flexDirection="column" 
          flexGrow={2} 
          border 
          borderStyle={focusedPanel === 'sessions' ? "double" : "single"} 
          borderColor={focusedPanel === 'sessions' ? colors.primary : colors.border}
        >
          <box flexDirection="row" paddingLeft={1} paddingRight={1} paddingBottom={0} justifyContent="space-between">
            <text fg={colors.textSubtle}>ACTIVE SESSIONS {isFiltering ? `(Filter: ${filterQuery})` : ''}</text>
            <text fg={colors.textMuted}>{processedSessions.length} sessions</text>
          </box>
          
          <box flexDirection="row" paddingLeft={1} paddingRight={1}>
            <text width={8} fg={colors.textSubtle}>PID</text>
            <text width={12} fg={colors.textSubtle}>AGENT</text>
            <text width={16} fg={colors.textSubtle}>MODEL</text>
            <text width={8} fg={colors.textSubtle}>TOKENS</text>
            <text width={8} fg={colors.textSubtle}>COST</text>
            <text flexGrow={1} fg={colors.textSubtle} paddingLeft={2}>PROJECT</text>
            <text width={6} fg={colors.textSubtle}>STATUS</text>
          </box>
          
          <scrollbox flexGrow={1}>
            <box flexDirection="column">
              {processedSessions.map((session, idx) => {
                const isSelected = idx === selectedRow;
                const rowFg = isSelected ? colors.background : colors.text;
                const providerColor = getProviderColor(session.providerId);
                const projectDisplay = session.projectPath.length > 20 
                  ? '…' + session.projectPath.slice(-19) 
                  : session.projectPath;

                return (
                  <box 
                    key={session.sessionId} 
                    flexDirection="row" 
                    paddingLeft={1} 
                    paddingRight={1}
                    {...(isSelected ? { backgroundColor: colors.primary } : {})}
                  >
                    <text width={8} fg={isSelected ? rowFg : colors.textMuted}>{session.sessionId.substr(4)}</text>
                    <text width={12} fg={isSelected ? rowFg : colors.text}>{session.agentName}</text>
                    <text width={16} fg={isSelected ? rowFg : providerColor}>{session.modelId.split('/').pop()?.slice(0,15)}</text>
                    <text width={8} fg={isSelected ? rowFg : colors.text}>{formatTokens(session.tokens.input + session.tokens.output).padStart(7)}</text>
                    <text width={8} fg={isSelected ? rowFg : colors.success}>{formatCurrency(session.cost).padStart(7)}</text>
                    <text flexGrow={1} fg={isSelected ? rowFg : colors.textSubtle} paddingLeft={2}>{projectDisplay}</text>
                    <text width={6} fg={isSelected ? rowFg : (session.status === 'active' ? colors.success : colors.textMuted)}>
                      {session.status === 'active' ? 'active' : 'idle'}
                    </text>
                  </box>
                );
              })}
            </box>
          </scrollbox>
        </box>

        {!sidebarCollapsed && (
          <box 
            flexDirection="column" 
            width={35} 
            gap={1}
            border
            borderStyle={focusedPanel === 'sidebar' ? "double" : "single"}
            borderColor={focusedPanel === 'sidebar' ? colors.primary : colors.border}
          >
            <box flexDirection="column" padding={1} flexGrow={1}>
              <text fg={colors.textSubtle} marginBottom={1}>MODEL BREAKDOWN</text>
              {modelStats.map(([modelId, cost]) => (
                <box key={modelId} flexDirection="column" marginBottom={1}>
                  <box flexDirection="row" justifyContent="space-between">
                    <text fg={colors.text}>{modelId.length > 15 ? modelId.slice(0,14)+'…' : modelId}</text>
                    <text fg={colors.textMuted}>{formatCurrency(cost)}</text>
                  </box>
                  <box flexDirection="row">
                    <text fg={getProviderColor(modelId)}>
                      {'█'.repeat(Math.ceil((cost / maxModelCost) * 20))}
                    </text>
                  </box>
                </box>
              ))}
            </box>

            <box flexDirection="column" padding={1} flexGrow={1}>
               <text fg={colors.textSubtle} marginBottom={1}>BY PROVIDER</text>
               {providerStats.map(([provider, cost]) => (
                 <box key={provider} flexDirection="row" justifyContent="space-between">
                   <text fg={getProviderColor(provider)}>{provider}</text>
                   <text fg={colors.text}>{formatCurrency(cost)}</text>
                 </box>
               ))}
            </box>
          </box>
        )}
      </box>
      
      <box flexDirection="row" paddingLeft={1}>
        <text fg={colors.textSubtle}>
          {isFiltering ? 'Type to filter  Esc cancel  Enter apply' : 
           focusedPanel === 'sessions' ? '/ filter  ↑↓ navigate  Enter details  s sort' :
           focusedPanel === 'sidebar' ? 'Tab back to sessions' :
           '/ filter  i sidebar  Tab switch  ? help'}
        </text>
      </box>
    </box>
  );
}
