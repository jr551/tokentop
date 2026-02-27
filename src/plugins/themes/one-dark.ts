import type { ThemePlugin } from "@tokentop/plugin-sdk";

export const oneDarkTheme: ThemePlugin = {
  apiVersion: 2,
  id: "one-dark",
  type: "theme",
  name: "One Dark",
  family: "one-dark",
  version: "1.0.0",
  permissions: {},

  colorScheme: "dark",

  colors: {
    background: "#282c34",
    foreground: "#31353f",
    text: "#abb2bf",
    textMuted: "#828997",
    textSubtle: "#5c6370",
    primary: "#61afef",
    secondary: "#c678dd",
    accent: "#56b6c2",
    success: "#98c379",
    warning: "#e5c07b",
    error: "#e06c75",
    info: "#61afef",
    border: "#3e4451",
    borderMuted: "#2c313a",
    selection: "#3e4451",
    highlight: "#2c313a",
    gaugeBackground: "#31353f",
    gaugeFill: "#61afef",
    gaugeWarning: "#e5c07b",
    gaugeDanger: "#e06c75",
  },

  components: {
    header: {
      background: "#21252b",
    },
    statusBar: {
      background: "#21252b",
    },
  },
};
