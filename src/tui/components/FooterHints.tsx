import { useColors } from "../contexts/ThemeContext.tsx";

export interface HintItem {
  key: string;
  action: string;
}

interface FooterHintsProps {
  hints: HintItem[];
}

export function FooterHints({ hints }: FooterHintsProps) {
  const colors = useColors();

  return (
    <box flexDirection="row" height={1} paddingLeft={1}>
      <text fg={colors.textSubtle}>
        {hints.map((h, i) => `${h.key} ${h.action}${i < hints.length - 1 ? "  " : ""}`).join("")}
      </text>
    </box>
  );
}
