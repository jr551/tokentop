import type { ThemePlugin } from '../types/theme.ts';

export const solarizedLightTheme: ThemePlugin = {
  apiVersion: 2,
  id: 'solarized-light',
  type: 'theme',
  name: 'Solarized Light',
  family: 'solarized',
  version: '1.0.0',
  permissions: {},

  colorScheme: 'light',

  colors: {
    background: '#fdf6e3',
    foreground: '#eee8d5',
    text: '#657b83',
    textMuted: '#839496',
    textSubtle: '#93a1a1',
    primary: '#268bd2',
    secondary: '#6c71c4',
    accent: '#2aa198',
    success: '#859900',
    warning: '#b58900',
    error: '#dc322f',
    info: '#268bd2',
    border: '#93a1a1',
    borderMuted: '#eee8d5',
    selection: '#eee8d5',
    highlight: '#eee8d5',
    gaugeBackground: '#eee8d5',
    gaugeFill: '#268bd2',
    gaugeWarning: '#b58900',
    gaugeDanger: '#dc322f',
  },

  components: {
    header: {
      background: '#eee8d5',
    },
    statusBar: {
      background: '#eee8d5',
    },
  },
};
