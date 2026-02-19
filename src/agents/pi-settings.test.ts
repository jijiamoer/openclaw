import { describe, expect, it, vi } from "vitest";
import {
  applyPiCompactionSettingsFromConfig,
  DEFAULT_PI_COMPACTION_RESERVE_TOKENS_FLOOR,
  ensurePiCompactionReserveTokens,
  resolveCompactionReserveTokensFloor,
} from "./pi-settings.js";

describe("applyPiCompactionSettingsFromConfig", () => {
  it("bumps reserveTokens when below floor", () => {
    const settingsManager = {
      getCompactionReserveTokens: () => 16_384,
      getCompactionKeepRecentTokens: () => 20_000,
      applyOverrides: vi.fn(),
    };

    const result = applyPiCompactionSettingsFromConfig({ settingsManager });

    expect(result.didOverride).toBe(true);
    expect(result.compaction.reserveTokens).toBe(DEFAULT_PI_COMPACTION_RESERVE_TOKENS_FLOOR);
    expect(settingsManager.applyOverrides).toHaveBeenCalledWith({
      compaction: { reserveTokens: DEFAULT_PI_COMPACTION_RESERVE_TOKENS_FLOOR },
    });
  });

  it("does not override when already above floor and not in safeguard mode", () => {
    const settingsManager = {
      getCompactionReserveTokens: () => 32_000,
      getCompactionKeepRecentTokens: () => 20_000,
      applyOverrides: vi.fn(),
    };

    const result = applyPiCompactionSettingsFromConfig({
      settingsManager,
      cfg: { agents: { defaults: { compaction: { mode: "default" } } } },
    });

    expect(result.didOverride).toBe(false);
    expect(result.compaction.reserveTokens).toBe(32_000);
    expect(settingsManager.applyOverrides).not.toHaveBeenCalled();
  });

  it("applies explicit reserveTokens but still enforces floor", () => {
    const settingsManager = {
      getCompactionReserveTokens: () => 10_000,
      getCompactionKeepRecentTokens: () => 20_000,
      applyOverrides: vi.fn(),
    };

    const result = applyPiCompactionSettingsFromConfig({
      settingsManager,
      cfg: {
        agents: {
          defaults: {
            compaction: { reserveTokens: 12_000, reserveTokensFloor: 20_000 },
          },
        },
      },
    });

    expect(result.compaction.reserveTokens).toBe(20_000);
    expect(settingsManager.applyOverrides).toHaveBeenCalledWith({
      compaction: { reserveTokens: 20_000 },
    });
  });

  it("applies keepRecentTokens when explicitly configured", () => {
    const settingsManager = {
      getCompactionReserveTokens: () => 20_000,
      getCompactionKeepRecentTokens: () => 20_000,
      applyOverrides: vi.fn(),
    };

    const result = applyPiCompactionSettingsFromConfig({
      settingsManager,
      cfg: {
        agents: {
          defaults: {
            compaction: {
              keepRecentTokens: 15_000,
            },
          },
        },
      },
    });

    expect(result.compaction.keepRecentTokens).toBe(15_000);
    expect(settingsManager.applyOverrides).toHaveBeenCalledWith({
      compaction: { keepRecentTokens: 15_000 },
    });
  });

  it("preserves current keepRecentTokens when safeguard mode leaves it unset", () => {
    const settingsManager = {
      getCompactionReserveTokens: () => 25_000,
      getCompactionKeepRecentTokens: () => 20_000,
      applyOverrides: vi.fn(),
    };

    const result = applyPiCompactionSettingsFromConfig({
      settingsManager,
      cfg: { agents: { defaults: { compaction: { mode: "safeguard" } } } },
    });

    expect(result.compaction.keepRecentTokens).toBe(20_000);
    expect(settingsManager.applyOverrides).not.toHaveBeenCalled();
  });

  it("treats keepRecentTokens=0 as invalid and keeps the current setting", () => {
    const settingsManager = {
      getCompactionReserveTokens: () => 25_000,
      getCompactionKeepRecentTokens: () => 20_000,
      applyOverrides: vi.fn(),
    };

    const result = applyPiCompactionSettingsFromConfig({
      settingsManager,
      cfg: { agents: { defaults: { compaction: { mode: "safeguard", keepRecentTokens: 0 } } } },
    });

    expect(result.compaction.keepRecentTokens).toBe(20_000);
    expect(settingsManager.applyOverrides).not.toHaveBeenCalled();
  });
});

describe("ensurePiCompactionReserveTokens", () => {
  it("bumps reserveTokens when below floor", () => {
    const settingsManager = {
      getCompactionReserveTokens: () => 16_384,
      getCompactionKeepRecentTokens: () => 20_000,
      applyOverrides: vi.fn(),
    };

    const result = ensurePiCompactionReserveTokens({ settingsManager });

    expect(result).toEqual({
      didOverride: true,
      reserveTokens: DEFAULT_PI_COMPACTION_RESERVE_TOKENS_FLOOR,
    });
    expect(settingsManager.applyOverrides).toHaveBeenCalledWith({
      compaction: { reserveTokens: DEFAULT_PI_COMPACTION_RESERVE_TOKENS_FLOOR },
    });
  });

  it("does not override when already above floor", () => {
    const settingsManager = {
      getCompactionReserveTokens: () => 32_000,
      getCompactionKeepRecentTokens: () => 20_000,
      applyOverrides: vi.fn(),
    };

    const result = ensurePiCompactionReserveTokens({ settingsManager });

    expect(result).toEqual({ didOverride: false, reserveTokens: 32_000 });
    expect(settingsManager.applyOverrides).not.toHaveBeenCalled();
  });
});

describe("resolveCompactionReserveTokensFloor", () => {
  it("returns the default when config is missing", () => {
    expect(resolveCompactionReserveTokensFloor()).toBe(DEFAULT_PI_COMPACTION_RESERVE_TOKENS_FLOOR);
  });

  it("accepts configured floors, including zero", () => {
    expect(
      resolveCompactionReserveTokensFloor({
        agents: { defaults: { compaction: { reserveTokensFloor: 24_000 } } },
      }),
    ).toBe(24_000);
    expect(
      resolveCompactionReserveTokensFloor({
        agents: { defaults: { compaction: { reserveTokensFloor: 0 } } },
      }),
    ).toBe(0);
  });
});

describe("compaction reserveTokensFloor vs model maxTokens safety", () => {
  /**
   * Pi's generateSummary historically used: maxTokens = Math.floor(0.8 * reserveTokens).
   * If reserveTokensFloor > model.maxTokens / 0.8, the summarization call
   * can exceed the model's limit, causing empty or failed summaries.
   */
  it("summary maxTokens derived from floor must not exceed a typical model maxTokens (32000)", () => {
    const MODEL_MAX_TOKENS = 32_000;
    const SUMMARY_TOKENS_RATIO = 0.8;

    const floor = resolveCompactionReserveTokensFloor({
      agents: { defaults: { compaction: { reserveTokensFloor: 40_000 } } },
    });
    const summaryMaxTokens = Math.floor(SUMMARY_TOKENS_RATIO * floor);

    expect(summaryMaxTokens).toBeLessThanOrEqual(MODEL_MAX_TOKENS);
  });

  it("default floor produces safe summary maxTokens for 32k-limited models", () => {
    const MODEL_MAX_TOKENS = 32_000;
    const SUMMARY_TOKENS_RATIO = 0.8;

    const floor = resolveCompactionReserveTokensFloor();
    const summaryMaxTokens = Math.floor(SUMMARY_TOKENS_RATIO * floor);

    expect(summaryMaxTokens).toBeLessThanOrEqual(MODEL_MAX_TOKENS);
  });

  it("detects misconfiguration: floor:120000 would produce maxTokens exceeding 32k model limit", () => {
    const MODEL_MAX_TOKENS = 32_000;
    const SUMMARY_TOKENS_RATIO = 0.8;

    const badFloor = resolveCompactionReserveTokensFloor({
      agents: { defaults: { compaction: { reserveTokensFloor: 120_000 } } },
    });
    const badSummaryMaxTokens = Math.floor(SUMMARY_TOKENS_RATIO * badFloor);

    expect(badSummaryMaxTokens).toBeGreaterThan(MODEL_MAX_TOKENS);
  });
});
