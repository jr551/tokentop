import type { NotificationPlugin, NotificationEvent } from './types/notification.ts';
import type { ProviderUsageData } from './types/provider.ts';
import { safeInvoke } from './plugin-host.ts';
import { createPluginLogger } from './sandbox.ts';
import type { AppConfig } from '@/config/schema.ts';

interface DedupEntry {
  key: string;
  timestamp: number;
}

const DEDUP_WINDOW_MS = 5 * 60_000; // 5 minutes — don't re-fire same event within this window

class NotificationBus {
  private plugins: NotificationPlugin[] = [];
  private recentEvents = new Map<string, DedupEntry>();
  private pluginConfigs = new Map<string, Record<string, unknown>>();

  registerPlugins(plugins: NotificationPlugin[]): void {
    this.plugins = plugins;
    for (const plugin of plugins) {
      if (!this.pluginConfigs.has(plugin.id)) {
        this.pluginConfigs.set(plugin.id, { enabled: true });
      }
    }
  }

  setPluginConfig(pluginId: string, config: Record<string, unknown>): void {
    this.pluginConfigs.set(pluginId, config);
  }

  async initializePlugins(): Promise<void> {
    for (const plugin of this.plugins) {
      const config = this.pluginConfigs.get(plugin.id) ?? { enabled: true };
      const logger = createPluginLogger(plugin.id);
      await safeInvoke(plugin.id, 'initialize', () =>
        plugin.initialize({ logger, config, signal: AbortSignal.timeout(10_000) }),
      );
    }
  }

  async checkProviderUsage(
    providerId: string,
    providerName: string,
    usage: ProviderUsageData,
  ): Promise<void> {
    if (usage.limitReached) {
      await this.emit(`provider.limitReached:${providerId}`, {
        type: 'provider.limitReached',
        severity: 'critical',
        title: `${providerName} Rate Limit Reached`,
        message: `Rate limit reached for ${providerName}. Requests may be throttled.`,
        timestamp: Date.now(),
        data: { provider: providerId },
      });
    }

    const primaryPercent = usage.limits?.primary?.usedPercent;
    if (primaryPercent !== null && primaryPercent !== undefined && primaryPercent >= 80 && !usage.limitReached) {
      await this.emit(`provider.limitReached:warning:${providerId}`, {
        type: 'provider.limitReached',
        severity: primaryPercent >= 95 ? 'critical' : 'warning',
        title: `${providerName} Approaching Limit`,
        message: `${providerName} usage at ${Math.round(primaryPercent)}%.`,
        timestamp: Date.now(),
        data: { provider: providerId, usedPercent: primaryPercent },
      });
    }
  }

  async checkBudget(
    cost: number,
    limit: number,
    budgetType: 'daily' | 'weekly' | 'monthly',
    config: AppConfig,
  ): Promise<void> {
    if (limit <= 0) return;

    const percent = (cost / limit) * 100;
    const label = capitalize(budgetType);

    if (percent >= config.alerts.criticalPercent) {
      await this.emit(`budget.limitReached:${budgetType}`, {
        type: 'budget.limitReached',
        severity: 'critical',
        title: `${label} Budget Critical`,
        message: `${label} spending at ${Math.round(percent)}% ($${cost.toFixed(2)}/$${limit.toFixed(2)}).`,
        timestamp: Date.now(),
        data: { budgetType, cost, limit, percent, currency: config.budgets.currency },
      });
    } else if (percent >= config.alerts.warningPercent) {
      await this.emit(`budget.thresholdCrossed:${budgetType}`, {
        type: 'budget.thresholdCrossed',
        severity: 'warning',
        title: `${label} Budget Warning`,
        message: `${label} spending at ${Math.round(percent)}% ($${cost.toFixed(2)}/$${limit.toFixed(2)}).`,
        timestamp: Date.now(),
        data: { budgetType, cost, limit, percent, currency: config.budgets.currency },
      });
    }
  }

  private async emit(dedupKey: string, event: NotificationEvent): Promise<void> {
    if (this.isDuplicate(dedupKey)) return;
    this.recordEvent(dedupKey);

    const matchingPlugins = this.plugins.filter((p) => {
      const config = this.pluginConfigs.get(p.id);
      if (config && config.enabled === false) return false;
      if (p.supports) return p.supports(event);
      return true;
    });

    await Promise.all(
      matchingPlugins.map((plugin) => {
        const config = this.pluginConfigs.get(plugin.id) ?? {};
        const logger = createPluginLogger(plugin.id);
        return safeInvoke(plugin.id, 'notify', () =>
          plugin.notify({ logger, config, signal: AbortSignal.timeout(10_000) }, event),
        );
      }),
    );
  }

  private isDuplicate(key: string): boolean {
    const recent = this.recentEvents.get(key);
    if (!recent) return false;
    return Date.now() - recent.timestamp < DEDUP_WINDOW_MS;
  }

  private recordEvent(key: string): void {
    this.recentEvents.set(key, { key, timestamp: Date.now() });
    this.pruneOldEvents();
  }

  private pruneOldEvents(): void {
    const cutoff = Date.now() - DEDUP_WINDOW_MS;
    for (const [key, entry] of this.recentEvents) {
      if (entry.timestamp < cutoff) {
        this.recentEvents.delete(key);
      }
    }
  }

  destroy(): void {
    this.plugins = [];
    this.recentEvents.clear();
    this.pluginConfigs.clear();
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export const notificationBus = new NotificationBus();
export type { NotificationBus };
