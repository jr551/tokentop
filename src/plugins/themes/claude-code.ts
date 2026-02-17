import type { ThemePlugin } from '../types/theme.ts';

export const claudeCodeTheme: ThemePlugin = {
  apiVersion: 2,
  id: 'claude-code',
  type: 'theme',
  name: 'Claude Code',
  family: 'claude-code',
  version: '1.0.0',
  permissions: {},

  colorScheme: 'dark',

  colors: {
    background: '#000000',
    foreground: '#373737',
    text: '#ffffff',
    textMuted: '#999999',
    textSubtle: '#505050',
    primary: '#D77757',
    secondary: '#B1B9F9',
    accent: '#EB9F7F',
    success: '#4EBA65',
    warning: '#FFC107',
    error: '#FF6B80',
    info: '#93A5FF',
    border: '#505050',
    borderMuted: '#373737',
    selection: '#413C41',
    highlight: '#374146',
    gaugeBackground: '#373737',
    gaugeFill: '#D77757',
    gaugeWarning: '#FFC107',
    gaugeDanger: '#FF6B80',
  },

  components: {
    header: {
      background: '#000000',
    },
    statusBar: {
      background: '#373737',
    },
  },
};
