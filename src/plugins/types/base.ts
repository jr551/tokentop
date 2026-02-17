/**
 * Base plugin types and interfaces for the tokentop plugin system.
 *
 * These types mirror the Plugin SDK (@tokentop/plugin-sdk) — the SDK is the
 * authoritative contract for community developers; core adapts to match.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

/**
 * Plugin type discriminator
 */
export type PluginType = "provider" | "agent" | "theme" | "notification";

/**
 * Current API contract version.
 * Core checks this at load time to ensure compatibility.
 */
export const CURRENT_API_VERSION = 2;

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

/**
 * Plugin permissions schema - defines what a plugin can access
 */
export const PluginPermissionsSchema = z.object({
  network: z
    .object({
      enabled: z.boolean(),
      allowedDomains: z.array(z.string()).optional(),
    })
    .optional(),
  filesystem: z
    .object({
      read: z.boolean().optional(),
      write: z.boolean().optional(),
      paths: z.array(z.string()).optional(),
    })
    .optional(),
  env: z
    .object({
      read: z.boolean().optional(),
      vars: z.array(z.string()).optional(),
    })
    .optional(),
  system: z
    .object({
      notifications: z.boolean().optional(),
      clipboard: z.boolean().optional(),
    })
    .optional(),
});

export type PluginPermissions = z.infer<typeof PluginPermissionsSchema>;

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

/**
 * Plugin metadata
 */
export const PluginMetaSchema = z.object({
  author: z.string().optional(),
  description: z.string().optional(),
  homepage: z.string().url().optional(),
  repository: z.string().url().optional(),
  license: z.string().optional(),
  /**
   * Brand color as a hex string (e.g. `"#d97757"`).
   * Used by the TUI for provider cards, charts, and status indicators.
   */
  brandColor: z.string().optional(),
  /**
   * Single-character icon or short glyph for compact displays.
   * Example: `"◆"`, `"▲"`, `"⚡"`
   */
  icon: z.string().optional(),
  /**
   * Additional provider IDs that should resolve to this plugin.
   * Coding agents may tag sessions with provider IDs that differ from
   * the plugin's `id` (e.g. OpenCode uses `"openai"` but the plugin
   * registers as `"openai-api"`). List those alternate IDs here so the
   * TUI can resolve brand colors and other metadata correctly.
   */
  providerAliases: z.array(z.string()).optional(),
});

export type PluginMeta = z.infer<typeof PluginMetaSchema>;

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Plugin configuration field definition (for plugin settings UI)
 */
export interface ConfigField {
  /** Data type of the setting value. */
  type: "string" | "number" | "boolean" | "select";
  /** Label shown in the settings UI. */
  label?: string;
  /** Help text shown below the field. */
  description?: string;
  /** Whether the field must have a value. */
  required?: boolean;
  /** Default value when no user config exists. */
  default?: unknown;
  /** Available options (for `select` type only). */
  options?: Array<{ value: string; label: string }>;
  /** Minimum value (for `number` type only). */
  min?: number;
  /** Maximum value (for `number` type only). */
  max?: number;
}

// ---------------------------------------------------------------------------
// Lifecycle Context
// ---------------------------------------------------------------------------

/**
 * Minimal context provided to lifecycle hooks.
 */
export interface PluginLifecycleContext {
  /** Plugin's validated configuration values. */
  readonly config: Record<string, unknown>;
  /** Scoped logger that prefixes all output with the plugin ID. */
  readonly logger: PluginLogger;
}

// ---------------------------------------------------------------------------
// Base Plugin
// ---------------------------------------------------------------------------

/**
 * Base plugin interface - all plugins must implement this.
 *
 * Provides identity, metadata, permissions, optional configuration schema,
 * and lifecycle hooks.
 */
export interface BasePlugin {
  /** API version this plugin targets. Must equal {@link CURRENT_API_VERSION}. */
  readonly apiVersion: 2;

  /** Unique plugin identifier (kebab-case) */
  readonly id: string;

  /** Plugin type discriminator */
  readonly type: PluginType;

  /** Human-readable display name */
  readonly name: string;

  /** Semantic version string */
  readonly version: string;

  /** Plugin metadata */
  readonly meta?: PluginMeta;

  /** Required permissions */
  readonly permissions: PluginPermissions;

  /** Plugin-declared configuration fields, rendered in Settings UI */
  readonly configSchema?: Record<string, ConfigField>;

  /**
   * Default config values. Used when no user configuration exists.
   * Keys must match those in {@link configSchema}.
   */
  readonly defaultConfig?: Record<string, unknown>;

  // -- Lifecycle Hooks (all optional) -------------------------------------

  /**
   * Called once after the plugin is loaded and validated.
   * Use for one-time setup (open connections, allocate resources).
   */
  initialize?(ctx: PluginLifecycleContext): Promise<void>;

  /**
   * Called when the plugin should begin active work (e.g. polling).
   * Called after `initialize()` during app startup, and after re-enable.
   */
  start?(ctx: PluginLifecycleContext): Promise<void>;

  /**
   * Called when the plugin should pause active work.
   * Called before `destroy()` during app shutdown, and on disable.
   */
  stop?(ctx: PluginLifecycleContext): Promise<void>;

  /**
   * Called once before the plugin is unloaded.
   * Use for cleanup (close connections, flush buffers).
   */
  destroy?(ctx: PluginLifecycleContext): Promise<void>;

  /**
   * Called when the user changes this plugin's configuration.
   * Receive the new validated config values.
   */
  onConfigChange?(
    config: Record<string, unknown>,
    ctx: PluginLifecycleContext,
  ): Promise<void> | void;
}

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

/**
 * Logger interface provided to plugins
 */
export interface PluginLogger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
}

// ---------------------------------------------------------------------------
// HTTP Client
// ---------------------------------------------------------------------------

/**
 * HTTP client interface provided to plugins (sandboxed)
 */
export interface PluginHttpClient {
  fetch(url: string, init?: RequestInit): Promise<Response>;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Plugin validation result
 */
export interface PluginValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Plugin load result
 */
export interface PluginLoadResult<T extends BasePlugin = BasePlugin> {
  success: boolean;
  plugin?: T;
  error?: string;
  source: "builtin" | "local" | "npm";
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * Plugin permission error
 */
export class PluginPermissionError extends Error {
  constructor(
    public readonly pluginId: string,
    public readonly permission: keyof PluginPermissions,
    message: string,
  ) {
    super(`Plugin "${pluginId}" permission denied: ${message}`);
    this.name = "PluginPermissionError";
  }
}
