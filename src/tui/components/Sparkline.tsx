import type { SparklineOrientation, SparklineStyle } from "@/config/schema.ts";
import { useColors } from "../contexts/ThemeContext.tsx";

export interface SparklineProps {
  data: number[];
  width?: number;
  label?: string;
  fixedMax?: number;
  thresholds?: { warning: number; error: number };
  style?: SparklineStyle;
  orientation?: SparklineOrientation;
  showBaseline?: boolean;
}

const BLOCK_CHARS_UP = ["▁", "▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];
const BLOCK_CHARS_DOWN = ["▔", "▔", "🬂", "🬎", "▀", "🬩", "🬷", "🮂", "█"];

function valueToBraille(
  left: number,
  right: number,
  orientation: SparklineOrientation,
  includeBaseline: boolean,
): string {
  const leftDots = Math.min(4, Math.max(0, Math.floor(left)));
  const rightDots = Math.min(4, Math.max(0, Math.floor(right)));

  let code = 0x2800;

  if (orientation === "up") {
    // Fill from bottom to top: dot7, dot3, dot2, dot1 (left) / dot8, dot6, dot5, dot4 (right)
    const leftBitsUp = [0x40, 0x04, 0x02, 0x01];
    const rightBitsUp = [0x80, 0x20, 0x10, 0x08];

    if (includeBaseline) {
      code |= 0x40 | 0x80; // Always include bottom row when baseline is on
    }

    for (let i = 0; i < leftDots; i++) {
      code |= leftBitsUp[i]!;
    }
    for (let i = 0; i < rightDots; i++) {
      code |= rightBitsUp[i]!;
    }
  } else {
    // Fill from top to bottom: dot1, dot2, dot3, dot7 (left) / dot4, dot5, dot6, dot8 (right)
    const leftBitsDown = [0x01, 0x02, 0x04, 0x40];
    const rightBitsDown = [0x08, 0x10, 0x20, 0x80];

    if (includeBaseline) {
      code |= 0x01 | 0x08; // Always include top row when baseline is on
    }

    for (let i = 0; i < leftDots; i++) {
      code |= leftBitsDown[i]!;
    }
    for (let i = 0; i < rightDots; i++) {
      code |= rightBitsDown[i]!;
    }
  }

  return String.fromCharCode(code);
}

function getBaselineBraille(orientation: SparklineOrientation): string {
  return orientation === "up" ? "⣀" : "⠉";
}

function getValueColor(
  rawValue: number,
  thresholds: { warning: number; error: number },
  colors: { success: string; warning: string; error: string; textSubtle: string },
): string {
  if (rawValue <= 0) return colors.textSubtle;
  if (rawValue >= thresholds.error) return colors.error;
  if (rawValue >= thresholds.warning) return colors.warning;
  return colors.success;
}

export function Sparkline({
  data,
  width = 60,
  label,
  fixedMax = 2000,
  thresholds = { warning: 800, error: 2000 },
  style = "braille",
  orientation = "up",
  showBaseline = true,
}: SparklineProps) {
  const colors = useColors();

  const peak = Math.max(...data, 0);
  const sqrtMax = Math.sqrt(fixedMax);

  const normalizeValue = (v: number): number => {
    if (v <= 0) return 0;
    const sqrtValue = Math.sqrt(Math.min(v, fixedMax));
    return (sqrtValue / sqrtMax) * (style === "braille" ? 4 : 8);
  };

  const peakLabel = peak >= 1000 ? `${(peak / 1000).toFixed(1)}k` : `${Math.round(peak)}`;

  if (style === "braille") {
    const effectiveWidth = width * 2;
    const displayData = data.slice(-effectiveWidth);
    const charCount = Math.ceil(displayData.length / 2);
    const padding = width - charCount;

    const groups: { color: string; chars: string }[] = [];
    const baselineChar = getBaselineBraille(orientation);

    for (let i = 0; i < displayData.length; i += 2) {
      const leftRaw = displayData[i] ?? 0;
      const rightRaw = displayData[i + 1] ?? leftRaw;

      const leftNorm = normalizeValue(leftRaw);
      const rightNorm = normalizeValue(rightRaw);

      const dominantRaw = Math.max(leftRaw, rightRaw);
      const color = getValueColor(dominantRaw, thresholds, colors);

      let char: string;
      if (dominantRaw <= 0) {
        char = showBaseline ? baselineChar : " ";
      } else {
        char = valueToBraille(leftNorm, rightNorm, orientation, showBaseline);
      }

      if (groups.length > 0 && groups[groups.length - 1]!.color === color) {
        groups[groups.length - 1]!.chars += char;
      } else {
        groups.push({ color, chars: char });
      }
    }

    return (
      <box flexDirection="column">
        <text>
          {padding > 0 && <span>{" ".repeat(padding)}</span>}
          {groups.map((group, i) => (
            <span key={i} fg={group.color}>
              {group.chars}
            </span>
          ))}
        </text>
        {label && (
          <text fg={colors.textMuted}>
            {label} peak:{peakLabel}
          </text>
        )}
      </box>
    );
  }

  const blockChars = orientation === "up" ? BLOCK_CHARS_UP : BLOCK_CHARS_DOWN;
  const baselineChar = showBaseline ? (orientation === "up" ? "▁" : "▔") : "·";

  const displayData = data.slice(-width);
  const padding = width - displayData.length;

  const groups: { color: string; chars: string }[] = [];
  for (let i = 0; i < displayData.length; i++) {
    const rawValue = displayData[i] ?? 0;
    const v = Math.round(normalizeValue(rawValue));

    const color = getValueColor(rawValue, thresholds, colors);
    const char = rawValue <= 0 ? baselineChar : (blockChars[v] ?? blockChars[1] ?? "▁");

    if (groups.length > 0 && groups[groups.length - 1]!.color === color) {
      groups[groups.length - 1]!.chars += char;
    } else {
      groups.push({ color, chars: char });
    }
  }

  return (
    <box flexDirection="column">
      <text>
        {padding > 0 && <span>{" ".repeat(padding)}</span>}
        {groups.map((group, i) => (
          <span key={i} fg={group.color}>
            {group.chars}
          </span>
        ))}
      </text>
      {label && (
        <text fg={colors.textMuted}>
          {label} peak:{peakLabel}
        </text>
      )}
    </box>
  );
}
