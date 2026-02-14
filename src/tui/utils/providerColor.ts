import type { ProviderState } from '../contexts/PluginContext.tsx';

let cachedAliases: Map<string, string> | null = null;
let cachedProviderRef: Map<string, ProviderState> | null = null;

function getAliasIndex(providers: Map<string, ProviderState>): Map<string, string> {
  if (cachedAliases && cachedProviderRef === providers) return cachedAliases;

  const aliases = new Map<string, string>();
  for (const [id, state] of providers) {
    for (const alias of state.plugin.meta?.providerAliases ?? []) {
      aliases.set(alias, id);
    }
  }
  cachedAliases = aliases;
  cachedProviderRef = providers;
  return aliases;
}

export function getProviderColor(
  providerId: string,
  providers: Map<string, ProviderState>,
  fallback: string,
): string {
  const direct = providers.get(providerId);
  if (direct) return direct.plugin.meta?.brandColor ?? fallback;

  const aliasTarget = getAliasIndex(providers).get(providerId);
  if (aliasTarget) return providers.get(aliasTarget)?.plugin.meta?.brandColor ?? fallback;

  return fallback;
}
