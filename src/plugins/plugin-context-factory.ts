import type { PluginPermissions } from './types/base.ts';
import type { PluginContext, PluginStorage } from './types/provider.ts';
import { createAuthSources } from './auth-sources.ts';
import { createSandboxedHttpClient, createPluginLogger } from './sandbox.ts';
import {
  pluginStorageGet,
  pluginStorageSet,
  pluginStorageDelete,
  pluginStorageHas,
  getDatabase,
} from '@/storage/database.ts';

let dbAvailable: boolean | null = null;

function isDbAvailable(): boolean {
  if (dbAvailable !== null) return dbAvailable;
  try {
    getDatabase();
    dbAvailable = true;
  } catch {
    dbAvailable = false;
  }
  return dbAvailable;
}

function createPluginStorage(pluginId: string): PluginStorage {
  return {
    async get(key: string): Promise<string | null> {
      if (!isDbAvailable()) return null;
      return pluginStorageGet(pluginId, key);
    },
    async set(key: string, value: string): Promise<void> {
      if (!isDbAvailable()) return;
      pluginStorageSet(pluginId, key, value);
    },
    async delete(key: string): Promise<void> {
      if (!isDbAvailable()) return;
      pluginStorageDelete(pluginId, key);
    },
    async has(key: string): Promise<boolean> {
      if (!isDbAvailable()) return false;
      return pluginStorageHas(pluginId, key);
    },
  };
}

export function resetDbAvailableCache(): void {
  dbAvailable = null;
}

export function createPluginContext(
  pluginId: string,
  permissions: PluginPermissions,
  signal?: AbortSignal
): PluginContext {
  return {
    config: {},
    logger: createPluginLogger(pluginId),
    http: createSandboxedHttpClient(pluginId, permissions),
    authSources: createAuthSources(pluginId, permissions),
    storage: createPluginStorage(pluginId),
    signal: signal ?? AbortSignal.timeout(30_000),
  };
}
