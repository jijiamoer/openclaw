import { describe, expect, it } from "vitest";
import { validateConfigObject } from "./config.js";

describe("Telegram reasoningDefault", () => {
  it('accepts channels.telegram.reasoningDefault="stream"', () => {
    const res = validateConfigObject({
      channels: {
        telegram: {
          botToken: "fake",
          reasoningDefault: "stream",
        },
      },
    });
    expect(res.ok).toBe(true);
  });

  it("rejects invalid channels.telegram.reasoningDefault", () => {
    const res = validateConfigObject({
      channels: {
        telegram: {
          botToken: "fake",
          reasoningDefault: "invalid",
        },
      },
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.issues.some((i) => i.path === "channels.telegram.reasoningDefault")).toBe(true);
    }
  });
});
