import type {
  NotificationContext,
  NotificationEvent,
  NotificationPlugin,
} from "../types/notification.ts";

export const visualFlashPlugin: NotificationPlugin = {
  apiVersion: 2,
  id: "visual-flash",
  type: "notification",
  name: "Visual Flash",
  version: "1.0.0",

  meta: {
    description: "Visual screen flash using ANSI escape sequences",
  },

  permissions: {},

  configSchema: {
    enabled: { type: "boolean", label: "Enabled", default: true, description: "Enable visual flash notifications" },
    duration: { type: "number", label: "Flash duration (ms)", default: 100, description: "Flash duration in milliseconds" },
  },

  supports(event: NotificationEvent): boolean {
    return (
      event.type.startsWith("budget.") ||
      event.type.startsWith("provider.") ||
      event.type === "plugin.crashed"
    );
  },

  async initialize(ctx: NotificationContext): Promise<void> {
    ctx.logger.debug("Visual flash notification plugin initialized");
  },

  async notify(ctx: NotificationContext, event: NotificationEvent): Promise<void> {
    const duration = (ctx.config.duration as number) ?? 100;

    const colorCode =
      event.severity === "critical" ? "41" : event.severity === "warning" ? "43" : "42";

    process.stdout.write(`\x1b[${colorCode}m`);
    await sleep(duration);
    process.stdout.write("\x1b[0m");
  },

  async test(ctx: NotificationContext): Promise<boolean> {
    ctx.logger.info("Testing visual flash...");
    process.stdout.write("\x1b[44m");
    await sleep(100);
    process.stdout.write("\x1b[0m");
    return true;
  },
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
