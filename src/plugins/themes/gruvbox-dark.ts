import type { ThemePlugin } from "@tokentop/plugin-sdk";

export const gruvboxDarkTheme: ThemePlugin = {
  apiVersion: 2,
  id: "gruvbox-dark",
  type: "theme",
  name: "Gruvbox Dark",
  family: "gruvbox",
  version: "1.0.0",
  permissions: {},

  colorScheme: "dark",

  colors: {
    background: "#282828",
    foreground: "#3c3836",
    text: "#ebdbb2",
    textMuted: "#bdae93",
    textSubtle: "#665c54",
    primary: "#83a598",
    secondary: "#d3869b",
    accent: "#8ec07c",
    success: "#b8bb26",
    warning: "#fabd2f",
    error: "#fb4934",
    info: "#83a598",
    border: "#504945",
    borderMuted: "#3c3836",
    selection: "#504945",
    highlight: "#3c3836",
    gaugeBackground: "#3c3836",
    gaugeFill: "#83a598",
    gaugeWarning: "#fabd2f",
    gaugeDanger: "#fb4934",
  },

  components: {
    header: {
      background: "#1d2021",
    },
    statusBar: {
      background: "#1d2021",
    },
  },
};
