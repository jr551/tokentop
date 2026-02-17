import type { ThemePlugin } from '../types/theme.ts';

export const gruvboxLightTheme: ThemePlugin = {
  apiVersion: 2,
  id: 'gruvbox-light',
  type: 'theme',
  name: 'Gruvbox Light',
  family: 'gruvbox',
  version: '1.0.0',
  permissions: {},

  colorScheme: 'light',

  colors: {
    background: '#fbf1c7',
    foreground: '#ebdbb2',
    text: '#3c3836',
    textMuted: '#504945',
    textSubtle: '#928374',
    primary: '#076678',
    secondary: '#8f3f71',
    accent: '#427b58',
    success: '#79740e',
    warning: '#b57614',
    error: '#9d0006',
    info: '#076678',
    border: '#bdae93',
    borderMuted: '#d5c4a1',
    selection: '#ebdbb2',
    highlight: '#ebdbb2',
    gaugeBackground: '#d5c4a1',
    gaugeFill: '#076678',
    gaugeWarning: '#b57614',
    gaugeDanger: '#9d0006',
  },

  components: {
    header: {
      background: '#f2e5bc',
    },
    statusBar: {
      background: '#ebdbb2',
    },
  },
};
