import { useColors } from '../contexts/ThemeContext.tsx';

interface InlineGaugeProps {
  percent: number | null;
  width?: number;
  color?: string;
}

export function InlineGauge({ percent, width = 20, color }: InlineGaugeProps) {
  const colors = useColors();

  if (percent === null || percent === undefined) {
    const emptyBar = '·'.repeat(width);
    return <text fg={colors.textSubtle}>{emptyBar}</text>;
  }

  const clamped = Math.max(0, Math.min(100, percent));
  const filledWidth = Math.round((clamped / 100) * width);
  const emptyWidth = width - filledWidth;

  const fillColor = clamped >= 90 ? colors.gaugeDanger :
                    clamped >= 70 ? colors.gaugeWarning :
                    color ?? colors.gaugeFill;

  const filledBar = '█'.repeat(filledWidth);
  const emptyBar = '·'.repeat(emptyWidth);

  return (
    <text>
      <span fg={fillColor}>{filledBar}</span>
      <span fg={colors.gaugeBackground}>{emptyBar}</span>
    </text>
  );
}
