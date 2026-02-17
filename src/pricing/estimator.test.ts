import { describe, expect, test } from "bun:test";
import type { ModelPricing } from "@/plugins/types/provider.ts";
import { estimateCost, estimateSessionCost, formatCost, formatTokenCount } from "./estimator.ts";

describe("estimateCost()", () => {
  test("calculates input and output costs for a typical coding session", () => {
    const usage = { input: 150_000, output: 50_000 };
    const pricing: ModelPricing = { input: 3, output: 15 };

    expect(estimateCost(usage, pricing)).toEqual({
      total: 1.2,
      input: 0.45,
      output: 0.75,
      currency: "USD",
    });
  });

  test("includes cache read and write costs when both usage and pricing are present", () => {
    const usage = { input: 100_000, output: 25_000, cacheRead: 80_000, cacheWrite: 40_000 };
    const pricing: ModelPricing = {
      input: 3,
      output: 15,
      cacheRead: 0.3,
      cacheWrite: 3.75,
    };

    expect(estimateCost(usage, pricing)).toEqual({
      total: 0.849,
      input: 0.3,
      output: 0.375,
      cacheRead: 0.024,
      cacheWrite: 0.15,
      currency: "USD",
    });
  });

  test("does not include cache fields when cache pricing is unavailable", () => {
    const usage = { input: 10_000, output: 20_000, cacheRead: 5_000, cacheWrite: 7_000 };
    const pricing: ModelPricing = { input: 2, output: 8 };

    expect(estimateCost(usage, pricing)).toEqual({
      total: 0.18,
      input: 0.02,
      output: 0.16,
      currency: "USD",
    });
  });

  test("returns zero cost for zero token usage", () => {
    const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
    const pricing: ModelPricing = { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 };

    expect(estimateCost(usage, pricing)).toEqual({
      total: 0,
      input: 0,
      output: 0,
      currency: "USD",
    });
  });

  test("handles very large token counts correctly", () => {
    const usage = {
      input: 123_456_789,
      output: 987_654_321,
      cacheRead: 55_555_555,
      cacheWrite: 44_444_444,
    };
    const pricing: ModelPricing = {
      input: 1.25,
      output: 10,
      cacheRead: 0.1,
      cacheWrite: 1,
    };

    expect(estimateCost(usage, pricing)).toEqual({
      total: 10080.864196,
      input: 154.320986,
      output: 9876.54321,
      cacheRead: 5.555556,
      cacheWrite: 44.444444,
      currency: "USD",
    });
  });

  test("rounds costs to six decimal places", () => {
    const usage = { input: 1, output: 1 };
    const pricing: ModelPricing = { input: 1.234567, output: 2.345678 };

    expect(estimateCost(usage, pricing)).toEqual({
      total: 0.000004,
      input: 0.000001,
      output: 0.000002,
      currency: "USD",
    });
  });
});

describe("estimateSessionCost()", () => {
  test("aggregates multiple sessions before estimating cost", () => {
    const sessions = [
      { input: 100_000, output: 20_000, cacheRead: 10_000, cacheWrite: 5_000 },
      { input: 50_000, output: 10_000, cacheRead: 5_000, cacheWrite: 10_000 },
      { input: 25_000, output: 5_000 },
    ];
    const pricing: ModelPricing = {
      input: 3,
      output: 15,
      cacheRead: 0.3,
      cacheWrite: 3.75,
    };

    expect(estimateSessionCost(sessions, pricing)).toEqual({
      total: 1.11075,
      input: 0.525,
      output: 0.525,
      cacheRead: 0.0045,
      cacheWrite: 0.05625,
      currency: "USD",
    });
  });

  test("returns zero cost for an empty session list", () => {
    const pricing: ModelPricing = { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 };

    expect(estimateSessionCost([], pricing)).toEqual({
      total: 0,
      input: 0,
      output: 0,
      currency: "USD",
    });
  });

  test("matches estimateCost for a single session", () => {
    const session = { input: 150_000, output: 50_000, cacheRead: 80_000, cacheWrite: 40_000 };
    const pricing: ModelPricing = {
      input: 3,
      output: 15,
      cacheRead: 0.3,
      cacheWrite: 3.75,
    };

    expect(estimateSessionCost([session], pricing)).toEqual(estimateCost(session, pricing));
  });
});

describe("formatCost()", () => {
  test("formats USD costs below $0.01 with 4 decimal places", () => {
    expect(formatCost(0.009876)).toBe("$0.0099");
  });

  test("formats USD costs below $1 with 3 decimal places", () => {
    expect(formatCost(0.45678)).toBe("$0.457");
  });

  test("formats USD costs at or above $1 with 2 decimal places", () => {
    expect(formatCost(12.3456)).toBe("$12.35");
  });

  test("formats non-USD currency with 4 decimals and currency suffix", () => {
    expect(formatCost(12.3456, "EUR")).toBe("12.3456 EUR");
  });
});

describe("formatTokenCount()", () => {
  test("returns raw token count for values below 1K", () => {
    expect(formatTokenCount(999)).toBe("999");
  });

  test("formats token count in K for values below 1M", () => {
    expect(formatTokenCount(12_500)).toBe("12.5K");
  });

  test("formats token count in M for values at or above 1M", () => {
    expect(formatTokenCount(2_345_678)).toBe("2.35M");
  });
});
