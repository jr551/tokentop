import type { ThemePlugin } from "../types/theme.ts";

export const catppuccinMochaTheme: ThemePlugin = {
  apiVersion: 2,
  id: "catppuccin-mocha",
  type: "theme",
  name: "Catppuccin Mocha",
  family: "catppuccin",
  version: "1.0.0",
  permissions: {},

  colorScheme: "dark",

  colors: {
    background: "#1e1e2e",
    foreground: "#313244",
    text: "#cdd6f4",
    textMuted: "#a6adc8",
    textSubtle: "#6c7086",
    primary: "#89b4fa",
    secondary: "#cba6f7",
    accent: "#94e2d5",
    success: "#a6e3a1",
    warning: "#f9e2af",
    error: "#f38ba8",
    info: "#89dceb",
    border: "#45475a",
    borderMuted: "#313244",
    selection: "#45475a",
    highlight: "#313244",
    gaugeBackground: "#313244",
    gaugeFill: "#89b4fa",
    gaugeWarning: "#f9e2af",
    gaugeDanger: "#f38ba8",
  },

  components: {
    header: {
      background: "#181825",
    },
    statusBar: {
      background: "#11111b",
    },
  },
};
