import { useColors } from '../contexts/ThemeContext.tsx';
import type { UsageSnapshot } from '../contexts/PluginContext.tsx';

interface InlineSparklineProps {
  history: UsageSnapshot[];
  width?: number;
}

function valueToBraille(left: number, right: number): string {
  const leftDots = Math.min(4, Math.max(0, Math.floor(left)));
  const rightDots = Math.min(4, Math.max(0, Math.floor(right)));

  let code = 0x2800;
  const leftBits = [0x40, 0x04, 0x02, 0x01];
  const rightBits = [0x80, 0x20, 0x10, 0x08];

  code |= 0x40 | 0x80;

  for (let i = 0; i < leftDots; i++) {
    code |= leftBits[i]!;
  }
  for (let i = 0; i < rightDots; i++) {
    code |= rightBits[i]!;
  }

  return String.fromCharCode(code);
}

export function InlineSparkline({ history, width = 8 }: InlineSparklineProps) {
  const colors = useColors();

  if (history.length < 2) {
    return <text fg={colors.textSubtle}>{'⣀'.repeat(width)}</text>;
  }

  const values = history.map(s => s.usedPercent ?? 0);
  const effectiveWidth = width * 2;
  const displayData = values.slice(-effectiveWidth);

  const max = Math.max(...displayData, 1);
  const normalize = (v: number): number => (v / max) * 4;

  const groups: { color: string; chars: string }[] = [];

  for (let i = 0; i < displayData.length; i += 2) {
    const leftRaw = displayData[i] ?? 0;
    const rightRaw = displayData[i + 1] ?? leftRaw;

    const leftNorm = normalize(leftRaw);
    const rightNorm = normalize(rightRaw);

    const dominantRaw = Math.max(leftRaw, rightRaw);
    const color = dominantRaw >= 90 ? colors.error :
                  dominantRaw >= 70 ? colors.warning :
                  dominantRaw > 0 ? colors.success :
                  colors.textSubtle;

    const char = dominantRaw <= 0 ? '⣀' : valueToBraille(leftNorm, rightNorm);

    if (groups.length > 0 && groups[groups.length - 1]!.color === color) {
      groups[groups.length - 1]!.chars += char;
    } else {
      groups.push({ color, chars: char });
    }
  }

  const charCount = Math.ceil(displayData.length / 2);
  const padding = width - charCount;

  return (
    <text>
      {padding > 0 && <span fg={colors.textSubtle}>{'⣀'.repeat(padding)}</span>}
      {groups.map((group, i) => (
        <span key={i} fg={group.color}>{group.chars}</span>
      ))}
    </text>
  );
}
