import type { ThemePlugin } from "@tokentop/plugin-sdk";

export const githubLightTheme: ThemePlugin = {
  apiVersion: 2,
  id: "github-light",
  type: "theme",
  name: "GitHub Light",
  family: "github",
  version: "1.0.0",
  permissions: {},

  colorScheme: "light",

  colors: {
    background: "#ffffff",
    foreground: "#f6f8fa",
    text: "#1f2328",
    textMuted: "#59636e",
    textSubtle: "#656d76",
    primary: "#0969da",
    secondary: "#8250df",
    accent: "#0550ae",
    success: "#1a7f37",
    warning: "#9a6700",
    error: "#cf222e",
    info: "#0969da",
    border: "#d0d7de",
    borderMuted: "#d8dee4",
    selection: "#ddf4ff",
    highlight: "#f6f8fa",
    gaugeBackground: "#d0d7de",
    gaugeFill: "#0969da",
    gaugeWarning: "#9a6700",
    gaugeDanger: "#cf222e",
  },

  components: {
    header: {
      background: "#f6f8fa",
    },
    statusBar: {
      background: "#f6f8fa",
    },
  },
};
