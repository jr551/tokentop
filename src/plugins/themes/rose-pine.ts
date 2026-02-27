import type { ThemePlugin } from "@tokentop/plugin-sdk";

export const rosePineTheme: ThemePlugin = {
  apiVersion: 2,
  id: "rose-pine",
  type: "theme",
  name: "Rosé Pine",
  family: "rose-pine",
  version: "1.0.0",
  permissions: {},

  colorScheme: "dark",

  colors: {
    background: "#191724",
    foreground: "#1f1d2e",
    text: "#e0def4",
    textMuted: "#908caa",
    textSubtle: "#6e6a86",
    primary: "#c4a7e7",
    secondary: "#ebbcba",
    accent: "#9ccfd8",
    success: "#31748f",
    warning: "#f6c177",
    error: "#eb6f92",
    info: "#9ccfd8",
    border: "#403d52",
    borderMuted: "#26233a",
    selection: "#403d52",
    highlight: "#26233a",
    gaugeBackground: "#1f1d2e",
    gaugeFill: "#c4a7e7",
    gaugeWarning: "#f6c177",
    gaugeDanger: "#eb6f92",
  },

  components: {
    header: {
      background: "#1f1d2e",
    },
    statusBar: {
      background: "#1f1d2e",
    },
  },
};
