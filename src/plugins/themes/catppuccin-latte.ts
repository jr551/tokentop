import type { ThemePlugin } from '../types/theme.ts';

export const catppuccinLatteTheme: ThemePlugin = {
  apiVersion: 2,
  id: 'catppuccin-latte',
  type: 'theme',
  name: 'Catppuccin Latte',
  family: 'catppuccin',
  version: '1.0.0',
  permissions: {},

  colorScheme: 'light',

  colors: {
    background: '#eff1f5',
    foreground: '#e6e9ef',
    text: '#4c4f69',
    textMuted: '#6c6f85',
    textSubtle: '#9ca0b0',
    primary: '#1e66f5',
    secondary: '#8839ef',
    accent: '#179299',
    success: '#40a02b',
    warning: '#df8e1d',
    error: '#d20f39',
    info: '#04a5e5',
    border: '#bcc0cc',
    borderMuted: '#ccd0da',
    selection: '#dce0e8',
    highlight: '#e6e9ef',
    gaugeBackground: '#ccd0da',
    gaugeFill: '#1e66f5',
    gaugeWarning: '#df8e1d',
    gaugeDanger: '#d20f39',
  },

  components: {
    header: {
      background: '#e6e9ef',
    },
    statusBar: {
      background: '#dce0e8',
    },
  },
};
