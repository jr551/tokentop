#!/usr/bin/env bun

/**
 * Headless Snapshot Script for Component Isolation Testing
 *
 * Renders components in a headless environment and captures the output.
 * Useful for debugging layout issues without running the full app.
 *
 * Usage:
 *   bun src/tui/debug/snapshot.tsx [component] [options]
 *
 * Examples:
 *   bun src/tui/debug/snapshot.tsx --list                    # List all available components
 *   bun src/tui/debug/snapshot.tsx header                    # Snapshot Header
 *   bun src/tui/debug/snapshot.tsx provider-card             # Snapshot ProviderCard
 *   bun src/tui/debug/snapshot.tsx kpi-strip                 # Snapshot KpiStrip
 *   bun src/tui/debug/snapshot.tsx --width 120 --height 40   # Custom dimensions
 *   bun src/tui/debug/snapshot.tsx toast --output frame.txt  # Custom output file
 *
 * Adding New Components:
 *   1. Create a mock data factory function: createMock<ComponentName>Props()
 *   2. Register it in COMPONENT_REGISTRY with render function
 *   3. That's it! The component will be available via CLI
 */

import { testRender } from "@opentui/react/test-utils";
import * as fs from "fs/promises";
import * as path from "path";
import type { ReactNode } from "react";
import { DEFAULT_CONFIG } from "@/config/schema.ts";
import { DebugConsole } from "../components/DebugConsole.tsx";
import { Header } from "../components/Header.tsx";
import { KpiStrip } from "../components/KpiStrip.tsx";
import { ProviderCard } from "../components/ProviderCard.tsx";
import { SessionDetailsDrawer } from "../components/SessionDetailsDrawer.tsx";
import { SkeletonGauge, SkeletonProviderContent, SkeletonText } from "../components/Skeleton.tsx";
import { Spinner } from "../components/Spinner.tsx";
import { StatusBar } from "../components/StatusBar.tsx";
import { Toast } from "../components/Toast.tsx";
import { UsageGauge } from "../components/UsageGauge.tsx";
import { AgentSessionProvider } from "../contexts/AgentSessionContext.tsx";
import { ConfigProvider } from "../contexts/ConfigContext.tsx";
import { InputProvider } from "../contexts/InputContext.tsx";
import { LogProvider } from "../contexts/LogContext.tsx";
import { PluginProvider } from "../contexts/PluginContext.tsx";
import { StorageProvider } from "../contexts/StorageContext.tsx";
import { ThemeProvider } from "../contexts/ThemeContext.tsx";
import { TimeWindowProvider } from "../contexts/TimeWindowContext.tsx";
import { ToastProvider } from "../contexts/ToastContext.tsx";
import { createDriver } from "../driver/driver.ts";
import { HistoricalTrendsView } from "../views/HistoricalTrendsView.tsx";
import { ProjectsView } from "../views/ProjectsView.tsx";
import { SettingsView } from "../views/SettingsView.tsx";
import { getFramesDir } from "./captureFrame.ts";

function createMockHeaderProps() {
  return {
    title: "tokentop",
    subtitle: "v0.1.0",
    activeView: "dashboard" as const,
  };
}

function createMockStatusBarProps() {
  const now = Date.now();
  return {
    lastRefresh: now - 30000,
    nextRefresh: now + 30000,
    message: "tokentop - htop for AI usage",
  };
}

function createMockProviderCardProps() {
  const now = Date.now();
  return {
    name: "Anthropic",
    configured: true,
    loading: false,
    color: "#D97706",
    focused: false,
    usage: {
      planType: "Claude Pro",
      limitReached: false,
      limits: {
        primary: {
          usedPercent: 65,
          label: "Daily Messages",
          windowMinutes: 1440,
          resetsAt: now + 3600000,
        },
        secondary: {
          usedPercent: 23,
          label: "Weekly Tokens",
          windowMinutes: 10080,
        },
      },
      credits: {
        hasCredits: true,
        unlimited: false,
        balance: "$42.50",
      },
      fetchedAt: now,
    },
  };
}

function createMockProviderCardLoadingProps() {
  return {
    name: "OpenAI",
    configured: true,
    loading: true,
    color: "#10A37F",
    focused: false,
    usage: null,
  };
}

function createMockProviderCardUnconfiguredProps() {
  return {
    name: "Google",
    configured: false,
    loading: false,
    color: "#4285F4",
    focused: false,
    usage: null,
  };
}

function createMockProviderCardErrorProps() {
  const now = Date.now();
  return {
    name: "Mistral",
    configured: true,
    loading: false,
    color: "#FF7000",
    focused: false,
    usage: {
      error: "API rate limit exceeded",
      fetchedAt: now,
    },
  };
}

function createMockUsageGaugeProps() {
  const now = Date.now();
  return {
    label: "Daily Tokens",
    usedPercent: 73,
    windowLabel: "24-hour window",
    resetsAt: now + 7200000,
    width: 40,
    color: "#7C3AED",
  };
}

function createMockToastProps() {
  return {
    message: "Settings saved successfully!",
    type: "success" as const,
    duration: 999999,
    onDismiss: () => {},
  };
}

function createMockToastErrorProps() {
  return {
    message: "Failed to connect to API",
    type: "error" as const,
    duration: 999999,
    onDismiss: () => {},
  };
}

function createMockToastWarningProps() {
  return {
    message: "Rate limit approaching",
    type: "warning" as const,
    duration: 999999,
    onDismiss: () => {},
  };
}

function createMockKpiStripProps() {
  const now = Date.now();
  return {
    totalCost: 12.43,
    totalTokens: 48250,
    totalRequests: 128,
    activeCount: 3,
    deltaCost: 3.12,
    deltaTokens: 12450,
    windowSec: 300,
    activity: {
      instantRate: 48,
      avgRate: 32,
      isSpike: false,
    },
    sparkData: [
      4, 6, 8, 12, 18, 22, 28, 36, 32, 40, 44, 48, 52, 48, 44, 40, 36, 32, 28, 24, 22, 20, 18, 16,
      14, 18, 22, 26, 30, 34, 38, 42, 46, 50, 54,
    ],
    budget: {
      limit: 25,
      budgetCost: 12.43,
      budgetType: "daily" as const,
      budgetTypeLabel: "Daily",
      warningPercent: 80,
      criticalPercent: 90,
    },
    lastRefreshAt: now - 30000,
  };
}

function createMockSpinnerProps() {
  return {
    color: "#7C3AED",
  };
}

function createMockSessionDetailsDrawerProps() {
  const now = Date.now();
  return {
    session: {
      sessionId: "ses_39c52c5b5ffe4D0eUfUnnCdNw4",
      sessionName: "test-smoke done",
      agentId: "opencode",
      agentName: "OpenCode",
      projectPath: "/Users/nigel/development/opencode-mission-control",
      startedAt: now - 10000000,
      lastActivityAt: now,
      status: "active" as const,
      totals: {
        input: 1500000,
        output: 200000,
        cacheRead: 10000000,
        cacheWrite: 5000000,
      },
      totalCostUsd: 16.05,
      requestCount: 150,
      streams: [
        {
          providerId: "anthropic",
          modelId: "claude-3-opus-20240229",
          tokens: {
            input: 1500000,
            output: 200000,
            cacheRead: 10000000,
            cacheWrite: 5000000,
          },
          requestCount: 150,
          costUsd: 16.05,
          costBreakdown: {
            total: 16.05,
            input: 0.01,
            output: 1.01,
            cacheRead: 10.03,
            cacheWrite: 5.0,
          },
        },
        {
          providerId: "openai",
          modelId: "gpt-4o",
          tokens: { input: 50000, output: 12000 },
          requestCount: 8,
          costUsd: 0.42,
          costBreakdown: {
            total: 0.42,
            input: 0.13,
            output: 0.29,
          },
        },
      ],
      costInDay: 16.05,
      costInWeek: 16.05,
      costInMonth: 16.05,
    },
    onClose: () => {},
  };
}

interface ComponentEntry {
  name: string;
  description: string;
  defaultWidth: number;
  defaultHeight: number;
  render: () => ReactNode;
}

const COMPONENT_REGISTRY: Record<string, ComponentEntry> = {
  header: {
    name: "Header",
    description: "Top navigation header with title and view tabs",
    defaultWidth: 100,
    defaultHeight: 3,
    render: () => <Header {...createMockHeaderProps()} />,
  },
  "status-bar": {
    name: "StatusBar",
    description: "Bottom status bar with refresh timing",
    defaultWidth: 100,
    defaultHeight: 3,
    render: () => <StatusBar {...createMockStatusBarProps()} />,
  },
  "provider-card": {
    name: "ProviderCard",
    description: "Provider usage card with gauges (configured state)",
    defaultWidth: 50,
    defaultHeight: 20,
    render: () => <ProviderCard {...createMockProviderCardProps()} />,
  },
  "provider-card-loading": {
    name: "ProviderCard (Loading)",
    description: "Provider card in loading state with skeleton",
    defaultWidth: 50,
    defaultHeight: 20,
    render: () => <ProviderCard {...createMockProviderCardLoadingProps()} />,
  },
  "provider-card-unconfigured": {
    name: "ProviderCard (Unconfigured)",
    description: "Provider card not configured state",
    defaultWidth: 50,
    defaultHeight: 20,
    render: () => <ProviderCard {...createMockProviderCardUnconfiguredProps()} />,
  },
  "provider-card-error": {
    name: "ProviderCard (Error)",
    description: "Provider card with error state",
    defaultWidth: 50,
    defaultHeight: 20,
    render: () => <ProviderCard {...createMockProviderCardErrorProps()} />,
  },
  "usage-gauge": {
    name: "UsageGauge",
    description: "Single usage gauge with progress bar",
    defaultWidth: 45,
    defaultHeight: 5,
    render: () => <UsageGauge {...createMockUsageGaugeProps()} />,
  },
  toast: {
    name: "Toast (Success)",
    description: "Toast notification - success variant",
    defaultWidth: 50,
    defaultHeight: 8,
    render: () => <Toast {...createMockToastProps()} />,
  },
  "toast-error": {
    name: "Toast (Error)",
    description: "Toast notification - error variant",
    defaultWidth: 50,
    defaultHeight: 8,
    render: () => <Toast {...createMockToastErrorProps()} />,
  },
  "toast-warning": {
    name: "Toast (Warning)",
    description: "Toast notification - warning variant",
    defaultWidth: 50,
    defaultHeight: 8,
    render: () => <Toast {...createMockToastWarningProps()} />,
  },
  spinner: {
    name: "Spinner",
    description: "Animated loading spinner",
    defaultWidth: 10,
    defaultHeight: 3,
    render: () => <Spinner {...createMockSpinnerProps()} />,
  },
  "skeleton-text": {
    name: "SkeletonText",
    description: "Shimmer loading placeholder for text",
    defaultWidth: 20,
    defaultHeight: 3,
    render: () => <SkeletonText width={15} />,
  },
  "skeleton-gauge": {
    name: "SkeletonGauge",
    description: "Shimmer loading placeholder for gauge",
    defaultWidth: 45,
    defaultHeight: 5,
    render: () => <SkeletonGauge barWidth={30} />,
  },
  "skeleton-provider": {
    name: "SkeletonProviderContent",
    description: "Full skeleton for provider card content",
    defaultWidth: 45,
    defaultHeight: 12,
    render: () => <SkeletonProviderContent />,
  },
  "debug-console": {
    name: "DebugConsole",
    description: "Debug console with log entries",
    defaultWidth: 100,
    defaultHeight: 20,
    render: () => <DebugConsole height={15} follow={true} />,
  },
  "kpi-strip": {
    name: "KpiStrip",
    description: "KPI strip with activity sparkline ramp",
    defaultWidth: 120,
    defaultHeight: 6,
    render: () => <KpiStrip {...createMockKpiStripProps()} />,
  },
  "historical-trends": {
    name: "HistoricalTrendsView",
    description: "ASCII chart showing cost trends over time",
    defaultWidth: 80,
    defaultHeight: 20,
    render: () => <HistoricalTrendsView />,
  },
  "projects-view": {
    name: "ProjectsView",
    description: "Sessions grouped by project with cost breakdown",
    defaultWidth: 100,
    defaultHeight: 25,
    render: () => (
      <InputProvider>
        <StorageProvider>
          <TimeWindowProvider defaultWindow="24h">
            <PluginProvider>
              <AgentSessionProvider autoRefresh={false}>
                <ProjectsView />
              </AgentSessionProvider>
            </PluginProvider>
          </TimeWindowProvider>
        </StorageProvider>
      </InputProvider>
    ),
  },
  "settings-view": {
    name: "SettingsView",
    description: "Application settings with categories",
    defaultWidth: 80,
    defaultHeight: 25,
    render: () => (
      <ConfigProvider initialConfig={DEFAULT_CONFIG}>
        <ToastProvider>
          <SettingsView />
        </ToastProvider>
      </ConfigProvider>
    ),
  },
  "session-details": {
    name: "SessionDetailsDrawer",
    description: "Detailed view of a session",
    defaultWidth: 100,
    defaultHeight: 30,
    render: () => <SessionDetailsDrawer {...createMockSessionDetailsDrawerProps()} />,
  },
};

interface SnapshotOptions {
  width?: number;
  height?: number;
  output?: string;
  component: string;
  list: boolean;
  all: boolean;
}

function parseArgs(): SnapshotOptions {
  const args = process.argv.slice(2);
  const options: SnapshotOptions = {
    component: "debug-inspector",
    list: false,
    all: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "--list" || arg === "-l") {
      options.list = true;
    } else if (arg === "--all" || arg === "-a") {
      options.all = true;
    } else if (arg === "--width" || arg === "-w") {
      const val = args[i + 1];
      if (val) {
        options.width = parseInt(val, 10);
        i++;
      }
    } else if (arg === "--height" || arg === "-h") {
      const val = args[i + 1];
      if (val) {
        options.height = parseInt(val, 10);
        i++;
      }
    } else if (arg === "--output" || arg === "-o") {
      const val = args[i + 1];
      if (val) {
        options.output = val;
        i++;
      }
    } else if (arg === "--help") {
      printHelp();
      process.exit(0);
    } else if (!arg.startsWith("-")) {
      options.component = arg;
    }
  }

  return options;
}

function printHelp(): void {
  console.log(`
Headless Component Snapshot Tool

Usage:
  bun src/tui/debug/snapshot.tsx [component] [options]

Options:
  --list, -l          List all available components
  --all, -a           Snapshot all components
  --width, -w <n>     Set terminal width (default: component-specific)
  --height, -h <n>    Set terminal height (default: component-specific)
  --output, -o <path> Output file path (default: auto-generated)
  --help              Show this help message

Examples:
  bun src/tui/debug/snapshot.tsx --list
  bun src/tui/debug/snapshot.tsx debug-inspector
  bun src/tui/debug/snapshot.tsx provider-card --width 60 --height 25
  bun src/tui/debug/snapshot.tsx toast --output my-toast.txt
  bun src/tui/debug/snapshot.tsx --all
`);
}

function printComponentList(): void {
  console.log("\nAvailable Components:\n");
  console.log("  ID                          Description");
  console.log("  " + "-".repeat(70));

  for (const [id, entry] of Object.entries(COMPONENT_REGISTRY)) {
    const paddedId = id.padEnd(28);
    console.log(`  ${paddedId}${entry.description}`);
  }

  console.log("\nUsage: bun src/tui/debug/snapshot.tsx <component-id>\n");
}

async function snapshotComponent(
  componentId: string,
  width?: number,
  height?: number,
): Promise<string> {
  const entry = COMPONENT_REGISTRY[componentId];
  if (!entry) {
    throw new Error(`Unknown component: ${componentId}`);
  }

  const finalWidth = width ?? entry.defaultWidth;
  const finalHeight = height ?? entry.defaultHeight;

  if (componentId === "kpi-strip") {
    const driver = await createDriver({ width: finalWidth, height: finalHeight });
    await driver.launch();
    await driver.waitForStable();
    const frame = await driver.capture();
    await driver.close();
    return frame;
  }

  const element = entry.render();

  const wrappedElement = (
    <ThemeProvider>
      <LogProvider>
        <box width={finalWidth} height={finalHeight}>
          {element}
        </box>
      </LogProvider>
    </ThemeProvider>
  );

  const testSetup = await testRender(wrappedElement, {
    width: finalWidth,
    height: finalHeight,
  });

  await testSetup.renderOnce();
  const frame = testSetup.captureCharFrame();
  testSetup.renderer.destroy();

  return frame;
}

async function saveSnapshot(
  componentId: string,
  frame: string,
  outputPath?: string,
): Promise<string> {
  const finalPath =
    outputPath ??
    path.join(
      getFramesDir(),
      `snapshot-${componentId}-${new Date().toISOString().replace(/[:.]/g, "-")}.txt`,
    );

  await fs.mkdir(path.dirname(finalPath), { recursive: true });
  await fs.writeFile(finalPath, frame, "utf-8");

  return finalPath;
}

async function main() {
  const options = parseArgs();

  if (options.list) {
    printComponentList();
    return;
  }

  if (options.all) {
    console.log("Capturing all components...\n");
    const framesDir = getFramesDir();
    const allDir = path.join(
      framesDir,
      `snapshot-all-${new Date().toISOString().replace(/[:.]/g, "-")}`,
    );
    await fs.mkdir(allDir, { recursive: true });

    for (const [id, entry] of Object.entries(COMPONENT_REGISTRY)) {
      try {
        const frame = await snapshotComponent(id, options.width, options.height);
        const outputPath = path.join(allDir, `${id}.txt`);
        await fs.writeFile(outputPath, frame, "utf-8");
        console.log(`  ✓ ${entry.name} -> ${id}.txt`);
      } catch (err) {
        console.error(`  ✗ ${entry.name}: ${err}`);
      }
    }

    console.log(`\nAll snapshots saved to: ${allDir}`);
    return;
  }

  const entry = COMPONENT_REGISTRY[options.component];
  if (!entry) {
    console.error(`Unknown component: ${options.component}`);
    console.error("\nAvailable components:");
    for (const id of Object.keys(COMPONENT_REGISTRY)) {
      console.error(`  - ${id}`);
    }
    process.exit(1);
  }

  const width = options.width ?? entry.defaultWidth;
  const height = options.height ?? entry.defaultHeight;

  console.log(`Capturing ${entry.name} at ${width}x${height}...`);

  const frame = await snapshotComponent(options.component, width, height);
  const outputPath = await saveSnapshot(options.component, frame, options.output);

  console.log(`Snapshot saved to: ${outputPath}`);
  console.log("\n--- Preview ---");
  console.log(frame);
}

main().catch((err) => {
  console.error("Snapshot failed:", err);
  process.exit(1);
});
