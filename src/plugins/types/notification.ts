import type { BasePlugin, PluginLogger } from './base.ts';

// ---------------------------------------------------------------------------
// Notification Events
// ---------------------------------------------------------------------------

export type NotificationSeverity = 'info' | 'warning' | 'critical';

export type NotificationEventType =
  | 'budget.thresholdCrossed'
  | 'budget.limitReached'
  | 'provider.fetchFailed'
  | 'provider.limitReached'
  | 'provider.recovered'
  | 'plugin.crashed'
  | 'plugin.disabled'
  | 'app.started'
  | 'app.updated';

export interface NotificationEvent {
  type: NotificationEventType;
  severity: NotificationSeverity;
  title: string;
  message: string;
  timestamp: number;
  data?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Notification Context
// ---------------------------------------------------------------------------

export interface NotificationContext {
  readonly logger: PluginLogger;
  readonly config: Record<string, unknown>;
  readonly signal: AbortSignal;
}

// ---------------------------------------------------------------------------
// Notification Plugin
// ---------------------------------------------------------------------------

export interface NotificationPlugin extends BasePlugin {
  readonly type: 'notification';

  initialize(ctx: NotificationContext): Promise<void>;
  notify(ctx: NotificationContext, event: NotificationEvent): Promise<void>;
  test?(ctx: NotificationContext): Promise<boolean>;
  supports?(event: NotificationEvent): boolean;
  destroy?(): Promise<void>;
}
