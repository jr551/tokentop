import type {
  NotificationContext,
  NotificationEvent,
  NotificationPlugin,
} from "@tokentop/plugin-sdk";

export const terminalBellPlugin: NotificationPlugin = {
  apiVersion: 2,
  id: "terminal-bell",
  type: "notification",
  name: "Terminal Bell",
  version: "1.0.0",

  meta: {
    description: "Simple terminal bell (BEL character) for alerts",
  },

  permissions: {},

  configSchema: {
    enabled: {
      type: "boolean",
      label: "Enabled",
      default: true,
      description: "Enable terminal bell notifications",
    },
    minSeverity: {
      label: "Minimum severity",
      description: "Only trigger bell for alerts at this severity or higher.",
      type: "select",
      default: "warning",
      options: [
        { value: "info", label: "Info" },
        { value: "warning", label: "Warning" },
        { value: "critical", label: "Critical" },
      ],
    },
  },

  supports(event: NotificationEvent): boolean {
    return (
      event.type.startsWith("budget.") ||
      event.type.startsWith("provider.") ||
      event.type === "plugin.crashed"
    );
  },

  async initialize(ctx: NotificationContext): Promise<void> {
    ctx.logger.debug("Terminal bell notification plugin initialized");
  },

  async notify(ctx: NotificationContext, event: NotificationEvent): Promise<void> {
    const severityOrder = ["info", "warning", "critical"];
    const minSeverity = (ctx.config.minSeverity as string) ?? "warning";

    if (severityOrder.indexOf(event.severity) < severityOrder.indexOf(minSeverity)) {
      return;
    }

    const bellCount = event.severity === "critical" ? 3 : 1;

    for (let i = 0; i < bellCount; i++) {
      process.stdout.write("\x07");
      if (i < bellCount - 1) {
        await sleep(200);
      }
    }
  },

  async test(ctx: NotificationContext): Promise<boolean> {
    ctx.logger.info("Testing terminal bell...");
    process.stdout.write("\x07");
    return true;
  },
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
