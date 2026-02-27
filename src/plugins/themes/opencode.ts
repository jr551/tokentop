import type { ThemePlugin } from "@tokentop/plugin-sdk";

export const opencodeTheme: ThemePlugin = {
  apiVersion: 2,
  id: "opencode",
  type: "theme",
  name: "OpenCode",
  family: "opencode",
  version: "1.0.0",
  permissions: {},

  colorScheme: "dark",

  colors: {
    background: "#111116",
    foreground: "#1a1b22",
    text: "#d4d4d8",
    textMuted: "#636670",
    textSubtle: "#3e4048",
    primary: "#56b6c2",
    secondary: "#5c9cf5",
    accent: "#e5c07b",
    success: "#7fd88f",
    warning: "#f5a742",
    error: "#e06c75",
    info: "#56b6c2",
    border: "#2e303a",
    borderMuted: "#222230",
    selection: "#252530",
    highlight: "#1a1b22",
    gaugeBackground: "#1a1b22",
    gaugeFill: "#56b6c2",
    gaugeWarning: "#f5a742",
    gaugeDanger: "#e06c75",
  },

  components: {
    header: {
      background: "#0a0a0e",
      titleColor: "#636670",
      titleAccentColor: "#e0e0e0",
    },
    statusBar: {
      background: "#0a0a0e",
    },
  },
};
