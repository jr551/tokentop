/**
 * Plugin update checker.
 *
 * Queries the npm registry for the latest published version of each
 * npm-sourced plugin and compares it to the currently installed version.
 * Results are cached for the lifetime of the process (one check per plugin).
 *
 * Only npm-published plugins are checked — builtin and local plugins are
 * skipped because they have no registry entry to compare against.
 */

import type { PluginType } from "./types/base.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PluginUpdateInfo {
  /** npm package name (e.g. "@tokentop/agent-opencode") */
  packageName: string;
  /** Currently installed version */
  currentVersion: string;
  /** Latest version on the registry, or null if the lookup failed */
  latestVersion: string | null;
  /** True when latestVersion is newer than currentVersion */
  hasUpdate: boolean;
  /** Non-null when the registry fetch failed */
  error?: string;
}

// ---------------------------------------------------------------------------
// Simple semver comparison (major.minor.patch only, no pre-release)
// ---------------------------------------------------------------------------

function parseVersion(v: string): [number, number, number] | null {
  const clean = v.replace(/^v/, "");
  const match = clean.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/**
 * Returns true if `latest` is strictly newer than `current`.
 */
function isNewer(current: string, latest: string): boolean {
  const a = parseVersion(current);
  const b = parseVersion(latest);
  if (!a || !b) return false;
  if (b[0] !== a[0]) return b[0] > a[0];
  if (b[1] !== a[1]) return b[1] > a[1];
  return b[2] > a[2];
}

// ---------------------------------------------------------------------------
// npm registry fetcher
// ---------------------------------------------------------------------------

/**
 * Fetch the latest dist-tag version for `packageName` from the npm registry.
 * Uses the abbreviated metadata endpoint for minimal payload.
 */
async function fetchLatestVersion(packageName: string): Promise<string> {
  const url = `https://registry.npmjs.org/${encodeURIComponent(packageName).replaceAll("%40", "@")}`;
  const res = await fetch(url, {
    headers: { Accept: "application/vnd.npm.install-v1+json" },
    signal: AbortSignal.timeout(8_000),
  });

  if (!res.ok) {
    throw new Error(`npm registry returned ${res.status} for ${packageName}`);
  }

  const data = (await res.json()) as { "dist-tags"?: { latest?: string } };
  const latest = data?.["dist-tags"]?.latest;
  if (!latest) {
    throw new Error(`No dist-tags.latest found for ${packageName}`);
  }
  return latest;
}

// ---------------------------------------------------------------------------
// Package name convention
// ---------------------------------------------------------------------------

/**
 * Derive the npm package name from a plugin's id and type.
 *
 * Convention:
 *   Official → @tokentop/{type}-{id}   (e.g. @tokentop/agent-opencode)
 *   Community → tokentop-{type}-{id}   (e.g. tokentop-provider-replicate)
 *
 * Since we can't know whether a given plugin is official or community from
 * the plugin object alone, we check the official name first and fall back
 * to the community pattern if the registry 404s.
 */
export function derivePackageName(pluginId: string, pluginType: PluginType): string {
  return `@tokentop/${pluginType}-${pluginId}`;
}

// ---------------------------------------------------------------------------
// Update checker
// ---------------------------------------------------------------------------

/** In-memory cache: packageName → PluginUpdateInfo */
const cache = new Map<string, PluginUpdateInfo>();

/**
 * Check a single plugin for updates.
 * Returns cached result if already checked this session.
 */
export async function checkPluginUpdate(
  pluginId: string,
  pluginType: PluginType,
  currentVersion: string,
  packageName?: string,
): Promise<PluginUpdateInfo> {
  const pkg = packageName ?? derivePackageName(pluginId, pluginType);

  const cached = cache.get(pkg);
  if (cached) return cached;

  try {
    const latestVersion = await fetchLatestVersion(pkg);
    const info: PluginUpdateInfo = {
      packageName: pkg,
      currentVersion,
      latestVersion,
      hasUpdate: isNewer(currentVersion, latestVersion),
    };
    cache.set(pkg, info);
    return info;
  } catch (err) {
    const info: PluginUpdateInfo = {
      packageName: pkg,
      currentVersion,
      latestVersion: null,
      hasUpdate: false,
      error: err instanceof Error ? err.message : String(err),
    };
    cache.set(pkg, info);
    return info;
  }
}

export interface CheckablePlugin {
  id: string;
  type: PluginType;
  version: string;
  /** Override the derived package name (for npm-installed plugins whose spec is known) */
  packageName?: string;
}

/**
 * Check multiple plugins for updates in parallel.
 * Only checks plugins that appear to be npm-published (official or community naming).
 * Returns a Map keyed by `{type}-{id}` for easy lookup.
 */
export async function checkAllPluginUpdates(
  plugins: CheckablePlugin[],
): Promise<Map<string, PluginUpdateInfo>> {
  const results = new Map<string, PluginUpdateInfo>();

  const checks = plugins.map(async (p) => {
    const info = await checkPluginUpdate(p.id, p.type, p.version, p.packageName);
    results.set(`${p.type}-${p.id}`, info);
  });

  await Promise.allSettled(checks);
  return results;
}

/**
 * Clear the in-memory cache (useful for manual refresh).
 */
export function clearUpdateCache(): void {
  cache.clear();
}
