import type { ThemePlugin } from "../types/theme.ts";

export const rosePineDawnTheme: ThemePlugin = {
  apiVersion: 2,
  id: "rose-pine-dawn",
  type: "theme",
  name: "Rosé Pine Dawn",
  family: "rose-pine",
  version: "1.0.0",
  permissions: {},

  colorScheme: "light",

  colors: {
    background: "#faf4ed",
    foreground: "#fffaf3",
    text: "#575279",
    textMuted: "#797593",
    textSubtle: "#9893a5",
    primary: "#907aa9",
    secondary: "#d7827e",
    accent: "#56949f",
    success: "#286983",
    warning: "#ea9d34",
    error: "#b4637a",
    info: "#56949f",
    border: "#cecacd",
    borderMuted: "#dfdad9",
    selection: "#dfdad9",
    highlight: "#f2e9e1",
    gaugeBackground: "#dfdad9",
    gaugeFill: "#907aa9",
    gaugeWarning: "#ea9d34",
    gaugeDanger: "#b4637a",
  },

  components: {
    header: {
      background: "#f2e9e1",
    },
    statusBar: {
      background: "#f2e9e1",
    },
  },
};
