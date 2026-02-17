export * from "./agent.ts";
export * from "./base.ts";
export * from "./notification.ts";
export * from "./provider.ts";
export * from "./theme.ts";

import type { AgentPlugin } from "./agent.ts";
import type { NotificationPlugin } from "./notification.ts";
import type { ProviderPlugin } from "./provider.ts";
import type { ThemePlugin } from "./theme.ts";

export type AnyPlugin = ProviderPlugin | AgentPlugin | ThemePlugin | NotificationPlugin;

export type PluginByType = {
  provider: ProviderPlugin;
  agent: AgentPlugin;
  theme: ThemePlugin;
  notification: NotificationPlugin;
};
