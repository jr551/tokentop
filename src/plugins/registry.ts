import type { PluginsConfig } from "@/config/schema.ts";
import {
  discoverLocalPlugins,
  loadLocalPlugin,
  loadNpmPlugin,
  resolvePluginPath,
} from "./loader.ts";
import { installAllNpmPlugins, resolveNpmPluginPath } from "./npm-installer.ts";
import type {
  AgentPlugin,
  AnyPlugin,
  NotificationPlugin,
  PluginByType,
  PluginType,
  ProviderPlugin,
  ThemePlugin,
} from "./types/index.ts";

export type PluginSource = "builtin" | "local" | "npm";

type PluginStore = {
  provider: Map<string, ProviderPlugin>;
  agent: Map<string, AgentPlugin>;
  theme: Map<string, ThemePlugin>;
  notification: Map<string, NotificationPlugin>;
};

class PluginRegistryImpl {
  private plugins: PluginStore = {
    provider: new Map(),
    agent: new Map(),
    theme: new Map(),
    notification: new Map(),
  };

  private sources = new Map<string, PluginSource>();
  private initialized = false;
  private officialIds = new Set<string>();

  private sourceKey(type: string, id: string): string {
    return `${type}-${id}`;
  }

  register(plugin: AnyPlugin, source: PluginSource = "builtin"): void {
    const key = this.sourceKey(plugin.type, plugin.id);
    const existingSource = this.sources.get(key);

    // Priority: local > npm > builtin
    // If a higher-priority source already registered this plugin, skip.
    const priority: Record<PluginSource, number> = { local: 2, npm: 1, builtin: 0 };
    if (existingSource && priority[existingSource] > priority[source]) {
      return;
    }

    if (existingSource && existingSource !== source) {
      console.info(`Plugin "${plugin.id}" overridden by ${source} (was ${existingSource})`);
    }

    this.sources.set(key, source);
    const map = this.plugins[plugin.type] as Map<string, AnyPlugin>;
    map.set(plugin.id, plugin);
  }

  unregister(type: PluginType, id: string): boolean {
    return this.plugins[type].delete(id);
  }

  get<T extends PluginType>(type: T, id: string): PluginByType[T] | undefined {
    return this.plugins[type].get(id) as PluginByType[T] | undefined;
  }

  getAll<T extends PluginType>(type: T): PluginByType[T][] {
    return [...this.plugins[type].values()] as PluginByType[T][];
  }

  getAllPlugins(): AnyPlugin[] {
    return [
      ...this.plugins.provider.values(),
      ...this.plugins.agent.values(),
      ...this.plugins.theme.values(),
      ...this.plugins.notification.values(),
    ];
  }

  has(type: PluginType, id: string): boolean {
    return this.plugins[type].has(id);
  }

  count(type?: PluginType): number {
    if (type) {
      return this.plugins[type].size;
    }
    return (
      this.plugins.provider.size +
      this.plugins.agent.size +
      this.plugins.theme.size +
      this.plugins.notification.size
    );
  }

  getSource(type: PluginType, id: string): PluginSource | undefined {
    return this.sources.get(this.sourceKey(type, id));
  }

  isOfficial(type: PluginType, id: string): boolean {
    return this.officialIds.has(this.sourceKey(type, id));
  }

  async loadBuiltinPlugins(): Promise<void> {
    const [providers, agents, themes, notifications] = await Promise.all([
      import("./providers/index.ts"),
      import("./agents/index.ts"),
      import("./themes/index.ts"),
      import("./notifications/index.ts"),
    ]);

    for (const plugin of Object.values(providers)) {
      if (isProviderPlugin(plugin)) {
        this.register(plugin, "builtin");
        this.officialIds.add(this.sourceKey(plugin.type, plugin.id));
      }
    }

    for (const plugin of Object.values(agents)) {
      if (isAgentPlugin(plugin)) {
        this.register(plugin, "builtin");
        this.officialIds.add(this.sourceKey(plugin.type, plugin.id));
      }
    }

    for (const plugin of Object.values(themes)) {
      if (isThemePlugin(plugin)) {
        this.register(plugin, "builtin");
        this.officialIds.add(this.sourceKey(plugin.type, plugin.id));
      }
    }

    for (const plugin of Object.values(notifications)) {
      if (isNotificationPlugin(plugin)) {
        this.register(plugin, "builtin");
        this.officialIds.add(this.sourceKey(plugin.type, plugin.id));
      }
    }
  }

  async loadLocalPlugins(extraPaths: string[] = []): Promise<void> {
    const discoveredPaths = await discoverLocalPlugins();
    const resolvedExtraPaths = extraPaths.map((p) => resolvePluginPath(p));
    const allPaths = [...discoveredPaths, ...resolvedExtraPaths];

    const results = await Promise.all(allPaths.map((p) => loadLocalPlugin(p)));
    for (const [i, result] of results.entries()) {
      if (result.success && result.plugin) {
        this.register(result.plugin, "local");
        console.info(`Loaded local plugin: ${result.plugin.name} (${result.plugin.id})`);
      } else {
        console.warn(`Failed to load plugin from ${allPaths[i]}: ${result.error}`);
      }
    }
  }

  async loadNpmPlugins(packages: string[]): Promise<void> {
    const installResults = await installAllNpmPlugins(packages);
    for (const ir of installResults) {
      if (ir.error) {
        console.warn(`Failed to install npm plugin ${ir.name}: ${ir.error}`);
        continue;
      }
      if (ir.installed) {
        console.info(`Installed npm plugin: ${ir.name}@${ir.version}`);
      }
    }

    const loadResults = await Promise.all(
      packages.map(async (packageName) => {
        const resolvedPath = resolveNpmPluginPath(packageName);
        const result = await loadNpmPlugin(packageName, resolvedPath);
        return { packageName, result };
      }),
    );
    for (const { packageName, result } of loadResults) {
      if (result.success && result.plugin) {
        this.register(result.plugin, "npm");
        console.info(`Loaded npm plugin: ${result.plugin.name} (${packageName})`);
      } else {
        console.warn(`Failed to load npm plugin ${packageName}: ${result.error}`);
      }
    }
  }

  disablePlugin(type: PluginType, id: string): boolean {
    return this.plugins[type].delete(id);
  }

  async initialize(config?: {
    plugins?: Partial<PluginsConfig>;
    cliPlugins?: string[];
  }): Promise<void> {
    if (this.initialized) return;

    await this.loadBuiltinPlugins();

    const localPaths = [...(config?.plugins?.local ?? []), ...(config?.cliPlugins ?? [])];
    await this.loadLocalPlugins(localPaths);

    const npmPackages = config?.plugins?.npm ?? [];
    if (npmPackages.length > 0) {
      await this.loadNpmPlugins(npmPackages);
    }

    const disabled = config?.plugins?.disabled ?? [];
    for (const pluginId of disabled) {
      for (const type of ["provider", "agent", "theme", "notification"] as PluginType[]) {
        if (this.has(type, pluginId)) {
          this.disablePlugin(type, pluginId);
          console.info(`Disabled plugin: ${pluginId}`);
        }
      }
    }

    this.initialized = true;
    console.info(
      `Plugin registry initialized: ${this.count("provider")} providers, ` +
        `${this.count("agent")} agents, ${this.count("theme")} themes, ` +
        `${this.count("notification")} notifications`,
    );
  }
}

function hasPluginShape(
  obj: unknown,
): obj is { id: string; type: string; name: string; version: string } {
  return (
    obj !== null &&
    typeof obj === "object" &&
    "id" in obj &&
    "type" in obj &&
    "name" in obj &&
    "version" in obj
  );
}

function isProviderPlugin(obj: unknown): obj is ProviderPlugin {
  return hasPluginShape(obj) && obj.type === "provider";
}

function isAgentPlugin(obj: unknown): obj is AgentPlugin {
  return hasPluginShape(obj) && obj.type === "agent";
}

function isThemePlugin(obj: unknown): obj is ThemePlugin {
  return hasPluginShape(obj) && obj.type === "theme";
}

function isNotificationPlugin(obj: unknown): obj is NotificationPlugin {
  return hasPluginShape(obj) && obj.type === "notification";
}

export const pluginRegistry = new PluginRegistryImpl();
export type PluginRegistry = PluginRegistryImpl;
