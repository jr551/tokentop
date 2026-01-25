import { createCliRenderer } from '@opentui/core';
import { createRoot } from '@opentui/react';
import { createAppElement, type CreateAppOptions } from './createApp.tsx';
import type { ThemePlugin } from '@/plugins/types/theme.ts';

export interface TuiOptions {
  theme?: ThemePlugin;
  refreshInterval?: number;
  debug?: boolean;
}

export async function startTui(options: TuiOptions = {}) {
  const renderer = await createCliRenderer({
    exitOnCtrlC: false,
  });

  const root = createRoot(renderer);

  const appOptions: CreateAppOptions = {};
  
  if (options.theme) {
    appOptions.initialTheme = options.theme;
  }
  if (options.refreshInterval !== undefined) {
    appOptions.refreshInterval = options.refreshInterval;
  }
  if (options.debug !== undefined) {
    appOptions.debug = options.debug;
  }

  root.render(createAppElement(appOptions));

  return renderer;
}

export { App } from './App.tsx';
export { createAppElement, type CreateAppOptions } from './createApp.tsx';
