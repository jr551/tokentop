import { useColors } from '../contexts/ThemeContext.tsx';

interface KPICardProps {
  title: string;
  value: string;
  delta?: string;
  subValue?: string;
  highlight?: boolean;
}

function KPICard({ title, value, delta, subValue, highlight = false }: KPICardProps) {
  const colors = useColors();
  return (
    <box 
      flexDirection="column" 
      paddingLeft={1}
      paddingRight={2}
      flexGrow={1}
    >
      <text fg={colors.textMuted}>{title}</text>
      <text fg={highlight ? colors.primary : colors.text}><strong>{value}</strong></text>
      {delta && <text fg={colors.success}>{delta}</text>}
      {subValue && <text fg={colors.textMuted}>{subValue}</text>}
    </box>
  );
}

interface SparklineProps {
  data: number[];
  width?: number;
  label?: string;
}

function Sparkline({ data, width = 60, label }: SparklineProps) {
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

export interface ActivityStatus {
  label: string;
  color: string;
}

export interface KpiStripProps {
  totalCost: number;
  totalTokens: number;
  totalRequests: number;
  activeCount: number;
  deltaCost: number;
  deltaTokens: number;
  activity: { rate: number; ema: number; isSpike: boolean };
  sparkData: number[];
}

export function KpiStrip({
  totalCost,
  totalTokens,
  totalRequests,
  activeCount,
  deltaCost,
  deltaTokens,
  activity,
  sparkData,
}: KpiStripProps) {
  const colors = useColors();
  
  const formatCurrency = (val: number) => `$${val.toFixed(2)}`;
  const formatTokens = (val: number) => val > 1000000 ? `${(val/1000000).toFixed(1)}M` : `${(val/1000).toFixed(1)}K`;
  const formatRate = (val: number) => val >= 1000 ? `${(val/1000).toFixed(1)}k` : `${Math.round(val)}`;
  
  const getActivityStatus = (): ActivityStatus => {
    const { ema, isSpike } = activity;
    if (isSpike || ema >= 2000) return { label: 'SPIKE', color: colors.error };
    if (ema >= 800) return { label: 'HOT', color: colors.warning };
    if (ema >= 200) return { label: 'BUSY', color: colors.success };
    if (ema >= 50) return { label: 'LOW', color: colors.textMuted };
    return { label: 'IDLE', color: colors.textSubtle };
  };

  const activityStatus = getActivityStatus();

  return (
    <>
      <box flexDirection="row" gap={0} height={4} flexShrink={0}>
        <KPICard 
          title="COST" 
          value={formatCurrency(totalCost)} 
          delta={`+${formatCurrency(deltaCost)} (5m)`} 
          highlight={true}
        />
        <KPICard 
          title="TOKENS" 
          value={formatTokens(totalTokens)} 
          delta={`+${formatTokens(deltaTokens)} (5m)`}
        />
        <KPICard 
          title="REQUESTS" 
          value={totalRequests.toLocaleString()} 
          subValue={`${activeCount} active`}
        />
        
        <box flexDirection="column" flexGrow={1} paddingLeft={1} paddingRight={1}>
          <box flexDirection="row" justifyContent="space-between">
            <text fg={colors.textMuted}>ACTIVITY</text>
            <text>
              <span fg={activityStatus.color}>{activityStatus.label}</span>
              <span fg={colors.textMuted}> {formatRate(activity.ema)}/s</span>
            </text>
          </box>
          <Sparkline data={sparkData} width={50} label="tokens/s (60s)" />
        </box>
      </box>
      
      <box height={1} overflow="hidden">
        <text fg={colors.border}>{'─'.repeat(300)}</text>
      </box>
    </>
  );
}
