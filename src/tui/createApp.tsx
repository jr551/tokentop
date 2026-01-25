import type { ReactNode } from 'react';
import type { ThemePlugin } from '@/plugins/types/theme.ts';
import { TestModeContext } from './hooks/useSafeRenderer.ts';

export { App } from './App.tsx';

export interface CreateAppOptions {
  initialTheme?: ThemePlugin;
  debug?: boolean;
  refreshInterval?: number;
  testMode?: boolean;
}

export const DEFAULT_APP_OPTIONS = {
  debug: false,
  refreshInterval: 60000,
  testMode: false,
} as const;

export function createAppElement(options: CreateAppOptions = {}): ReactNode {
  const { App } = require('./App.tsx');
  const isTestMode = options.testMode ?? DEFAULT_APP_OPTIONS.testMode;
  
  const appElement = (
    <App
      {...(options.initialTheme ? { initialTheme: options.initialTheme } : {})}
      debug={options.debug ?? DEFAULT_APP_OPTIONS.debug}
    />
  );
  
  if (isTestMode) {
    return (
      <TestModeContext.Provider value={true}>
        {appElement}
      </TestModeContext.Provider>
    );
  }
  
  return appElement;
}
