import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import type { DemoPreset } from "@/demo/simulator.ts";
import { type CreateAppOptions, createAppElement } from "./createApp.tsx";

export interface TuiOptions {
  refreshInterval?: number;
  debug?: boolean;
  demo?: boolean;
  demoSeed?: number;
  demoPreset?: DemoPreset;
  cliPlugins?: string[];
}

export async function startTui(options: TuiOptions = {}) {
  const renderer = await createCliRenderer({
    exitOnCtrlC: false,
    autoFocus: true,
  });

  const root = createRoot(renderer);

  const appOptions: CreateAppOptions = {};

  if (options.refreshInterval !== undefined) {
    appOptions.refreshInterval = options.refreshInterval;
  }
  if (options.debug !== undefined) {
    appOptions.debug = options.debug;
  }
  if (options.demo !== undefined) {
    appOptions.demoMode = options.demo;
  }
  if (options.demoSeed !== undefined) {
    appOptions.demoSeed = options.demoSeed;
  }
  if (options.demoPreset !== undefined) {
    appOptions.demoPreset = options.demoPreset;
  }
  if (options.cliPlugins !== undefined) {
    appOptions.cliPlugins = options.cliPlugins;
  }

  root.render(createAppElement(appOptions));

  return renderer;
}

export { App } from "./App.tsx";
export { type CreateAppOptions, createAppElement } from "./createApp.tsx";
