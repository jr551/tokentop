import type { ThemePlugin } from "../types/theme.ts";

export const kanagawaTheme: ThemePlugin = {
  apiVersion: 2,
  id: "kanagawa",
  type: "theme",
  name: "Kanagawa",
  family: "kanagawa",
  version: "1.0.0",
  permissions: {},

  colorScheme: "dark",

  colors: {
    background: "#1f1f28",
    foreground: "#2a2a37",
    text: "#dcd7ba",
    textMuted: "#c8c093",
    textSubtle: "#727169",
    primary: "#7e9cd8",
    secondary: "#957fb8",
    accent: "#7fb4ca",
    success: "#76946a",
    warning: "#e6c384",
    error: "#c34043",
    info: "#7fb4ca",
    border: "#54546d",
    borderMuted: "#363646",
    selection: "#2d4f67",
    highlight: "#2a2a37",
    gaugeBackground: "#2a2a37",
    gaugeFill: "#7e9cd8",
    gaugeWarning: "#e6c384",
    gaugeDanger: "#c34043",
  },

  components: {
    header: {
      background: "#16161d",
    },
    statusBar: {
      background: "#16161d",
    },
  },
};
