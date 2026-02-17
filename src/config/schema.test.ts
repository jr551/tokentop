import * as fs from 'fs/promises';
import { afterEach, describe, expect, spyOn, test } from 'bun:test';

import { DEFAULT_CONFIG, loadConfig } from './schema.ts';

const readFileSpies: Array<ReturnType<typeof spyOn<typeof fs, 'readFile'>>> = [];

function mockReadFileWithJson(config: unknown) {
  const spy = spyOn(fs, 'readFile');
  spy.mockResolvedValue(JSON.stringify(config));
  readFileSpies.push(spy);
}

function mockReadFileWithRaw(content: string) {
  const spy = spyOn(fs, 'readFile');
  spy.mockResolvedValue(content);
  readFileSpies.push(spy);
}

function mockReadFileError(error: Error) {
  const spy = spyOn(fs, 'readFile');
  spy.mockRejectedValue(error);
  readFileSpies.push(spy);
}

afterEach(() => {
  for (const spy of readFileSpies) {
    spy.mockRestore();
  }
  readFileSpies.length = 0;
});

describe('DEFAULT_CONFIG', () => {
  test('has expected top-level structure', () => {
    expect(Object.keys(DEFAULT_CONFIG).sort()).toEqual(
      [
        'alerts',
        'budgets',
        'configVersion',
        'display',
        'notifications',
        'pluginConfig',
        'plugins',
        'providers',
        'refresh',
      ].sort()
    );
  });

  test('uses expected default values', () => {
    expect(DEFAULT_CONFIG.refresh.intervalMs).toBe(60000);
    expect(DEFAULT_CONFIG.display.defaultTimeWindow).toBe('1h');
    expect(DEFAULT_CONFIG.display.theme).toBe('tokyo-night');
    expect(DEFAULT_CONFIG.display.colorScheme).toBe('auto');

    expect(DEFAULT_CONFIG.budgets.daily).toBeNull();
    expect(DEFAULT_CONFIG.budgets.weekly).toBeNull();
    expect(DEFAULT_CONFIG.budgets.monthly).toBeNull();

    expect(DEFAULT_CONFIG.alerts.warningPercent).toBe(80);
    expect(DEFAULT_CONFIG.alerts.criticalPercent).toBe(95);

    expect(DEFAULT_CONFIG.plugins.local).toEqual([]);
    expect(DEFAULT_CONFIG.plugins.npm).toEqual([]);
    expect(DEFAULT_CONFIG.plugins.disabled).toEqual([]);
  });
});

describe('loadConfig', () => {
  test("returns defaults when config file doesn't exist", async () => {
    mockReadFileError(new Error('ENOENT'));

    const loaded = await loadConfig();

    expect(loaded).toEqual(DEFAULT_CONFIG);
  });

  test('merges partial overrides with defaults', async () => {
    mockReadFileWithJson({
      refresh: { intervalMs: 15000 },
      budgets: { daily: 25 },
      alerts: { warningPercent: 70 },
      plugins: { local: ['~/plugins/local-theme.ts'] },
    });

    const loaded = await loadConfig();

    expect(loaded.refresh.intervalMs).toBe(15000);
    expect(loaded.refresh.pauseAutoRefresh).toBe(DEFAULT_CONFIG.refresh.pauseAutoRefresh);
    expect(loaded.budgets.daily).toBe(25);
    expect(loaded.budgets.weekly).toBeNull();
    expect(loaded.alerts.warningPercent).toBe(70);
    expect(loaded.alerts.criticalPercent).toBe(DEFAULT_CONFIG.alerts.criticalPercent);
    expect(loaded.plugins.local).toEqual(['~/plugins/local-theme.ts']);
    expect(loaded.plugins.npm).toEqual([]);
  });

  test('applies nested display overrides without dropping sibling defaults', async () => {
    mockReadFileWithJson({
      display: { theme: 'dracula' },
    });

    const loaded = await loadConfig();

    expect(loaded.display.theme).toBe('dracula');
    expect(loaded.display.defaultTimeWindow).toBe(DEFAULT_CONFIG.display.defaultTimeWindow);
    expect(loaded.display.colorScheme).toBe(DEFAULT_CONFIG.display.colorScheme);
    expect(loaded.display.timeFormat).toBe(DEFAULT_CONFIG.display.timeFormat);
  });

  test('deep merges display.sparkline.style while preserving other sparkline defaults', async () => {
    mockReadFileWithJson({
      display: {
        sparkline: {
          style: 'block',
        },
      },
    });

    const loaded = await loadConfig();

    expect(loaded.display.sparkline.style).toBe('block');
    expect(loaded.display.sparkline.orientation).toBe(DEFAULT_CONFIG.display.sparkline.orientation);
    expect(loaded.display.sparkline.showBaseline).toBe(DEFAULT_CONFIG.display.sparkline.showBaseline);
  });

  test('falls back to defaults for invalid JSON', async () => {
    mockReadFileWithRaw(`{
      // comments are not valid JSON
      "display": { "theme": "dracula" }
    }`);

    const loaded = await loadConfig();
    expect(loaded.display.theme).toBe(DEFAULT_CONFIG.display.theme);
  });

  test('parses valid JSON with budget overrides', async () => {
    mockReadFileWithRaw(`{
      "budgets": { "daily": 100 }
    }`);

    const loaded = await loadConfig();
    expect(loaded.budgets.daily).toBe(100);
  });

  test('parses valid JSON with multiple overrides', async () => {
    mockReadFileWithRaw(`{
      "budgets": { "daily": 50, "weekly": 200 },
      "alerts": { "warningPercent": 90 }
    }`);

    const loaded = await loadConfig();
    expect(loaded.budgets.daily).toBe(50);
    expect(loaded.budgets.weekly).toBe(200);
    expect(loaded.alerts.warningPercent).toBe(90);
  });

  test('does not strip // inside string values', async () => {
    mockReadFileWithRaw(`{
      "plugins": { "local": ["~/my-plugin // v2"] }
    }`);

    const loaded = await loadConfig();
    expect(loaded.plugins.local).toEqual(['~/my-plugin // v2']);
  });
});
