import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { PluginPermissionError } from "@tokentop/plugin-sdk";
import {
  deepFreeze,
  getActivePluginGuard,
  installGlobalFetchGuard,
  runInPluginGuard,
} from "./sandbox-guard.ts";

const originalFetch = globalThis.fetch;
const fetchCalls: string[] = [];

const mockFetch: typeof fetch = Object.assign(
  (input: string | URL | Request, _init?: RequestInit): Promise<Response> => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    fetchCalls.push(url);
    return Promise.resolve(new Response("ok", { status: 200 }));
  },
  { preconnect: originalFetch.preconnect },
);

describe("deepFreeze", () => {
  test("freezes a plain object", () => {
    const obj = { a: 1 };
    deepFreeze(obj);

    expect(Object.isFrozen(obj)).toBe(true);
  });

  test("freezes nested objects recursively", () => {
    const obj = {
      top: {
        child: {
          value: 1,
        },
      },
    };

    deepFreeze(obj);

    expect(Object.isFrozen(obj)).toBe(true);
    expect(Object.isFrozen(obj.top)).toBe(true);
    expect(Object.isFrozen(obj.top.child)).toBe(true);
  });

  test("returns the same reference", () => {
    const obj = { nested: { value: 1 } };
    const frozen = deepFreeze(obj);

    expect(frozen).toBe(obj);
  });

  test("handles null and undefined gracefully", () => {
    expect(deepFreeze(null)).toBeNull();
    expect(deepFreeze(undefined)).toBeUndefined();
  });

  test("handles circular references without infinite loop", () => {
    const obj: { self?: unknown; nested: { parent?: unknown } } = {
      nested: {},
    };
    obj.self = obj;
    obj.nested.parent = obj;

    const frozen = deepFreeze(obj);

    expect(frozen).toBe(obj);
    expect(Object.isFrozen(obj)).toBe(true);
    expect(Object.isFrozen(obj.nested)).toBe(true);
  });

  test("handles already-frozen objects", () => {
    const obj = Object.freeze({ already: true });

    const frozen = deepFreeze(obj);

    expect(frozen).toBe(obj);
    expect(Object.isFrozen(frozen)).toBe(true);
  });
});

describe("runInPluginGuard and getActivePluginGuard", () => {
  test("returns undefined outside guard", () => {
    expect(getActivePluginGuard()).toBeUndefined();
  });

  test("returns plugin context inside guard", () => {
    const context = runInPluginGuard("plugin-a", {}, () => getActivePluginGuard());

    expect(context).toBeDefined();
    expect(context?.pluginId).toBe("plugin-a");
  });

  test("preserves context across async/await", async () => {
    const context = await runInPluginGuard("plugin-async", {}, async () => {
      await Promise.resolve();
      return getActivePluginGuard();
    });

    expect(context).toBeDefined();
    expect(context?.pluginId).toBe("plugin-async");
  });

  test("nested guards use the innermost context", () => {
    const contexts = runInPluginGuard("outer-plugin", {}, () => {
      const outerBefore = getActivePluginGuard();
      const inner = runInPluginGuard("inner-plugin", {}, () => getActivePluginGuard());
      const outerAfter = getActivePluginGuard();

      return { outerBefore, inner, outerAfter };
    });

    expect(contexts.outerBefore?.pluginId).toBe("outer-plugin");
    expect(contexts.inner?.pluginId).toBe("inner-plugin");
    expect(contexts.outerAfter?.pluginId).toBe("outer-plugin");
  });
});

describe("installGlobalFetchGuard", () => {
  beforeAll(() => {
    globalThis.fetch = mockFetch;
    installGlobalFetchGuard();
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  test("outside guard, fetch calls pass through", async () => {
    fetchCalls.length = 0;

    const response = await fetch("https://outside-guard.example");

    expect(response.status).toBe(200);
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0]).toContain("outside-guard.example");
  });

  test("inside guard with no network permission throws PluginPermissionError", () => {
    expect(() => {
      runInPluginGuard("plugin-no-network", {}, () => {
        void fetch("https://blocked.example");
      });
    }).toThrow(PluginPermissionError);
  });

  test("inside guard with allowedDomains blocks unlisted domains", () => {
    expect(() => {
      runInPluginGuard(
        "plugin-allowlist",
        {
          network: {
            enabled: true,
            allowedDomains: ["allowed.example"],
          },
        },
        () => {
          void fetch("https://not-allowed.example/path");
        },
      );
    }).toThrow(PluginPermissionError);
  });

  test("inside guard with allowedDomains allows listed domains and subdomains", async () => {
    fetchCalls.length = 0;

    const response = await runInPluginGuard(
      "plugin-allowlist",
      {
        network: {
          enabled: true,
          allowedDomains: ["allowed.example"],
        },
      },
      async () => {
        const rootResponse = await fetch("https://allowed.example/path");
        await fetch("https://api.allowed.example/path");
        return rootResponse;
      },
    );

    expect(response.status).toBe(200);
    expect(fetchCalls).toHaveLength(2);
    expect(fetchCalls[0]).toContain("allowed.example/path");
    expect(fetchCalls[1]).toContain("api.allowed.example/path");
  });
});
