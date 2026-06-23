import { describe, expect, it } from "vitest";

import { __testExports } from "./quota.ts";

describe("Antigravity quota aggregation", () => {
  it("uses the best available Gemini variant instead of the most exhausted rollout variant", () => {
    const summary = __testExports.aggregateQuota({
      "gemini-3.5-flash-low": {
        displayName: "Gemini 3.5 Flash Low",
        quotaInfo: {
          remainingFraction: 1,
          resetTime: "2026-05-26T18:00:00Z",
        },
      },
      "gemini-3-flash-agent": {
        displayName: "Gemini 3 Flash Agent",
        quotaInfo: {
          remainingFraction: 0,
          resetTime: "2026-05-27T18:00:00Z",
        },
      },
    });

    expect(summary.groups["gemini-nonweekly"]?.remainingFraction).toBe(1);
    expect(summary.groups["gemini-nonweekly"]?.resetTime).toBe("2026-05-26T18:00:00Z");
    expect(summary.groups["gemini-nonweekly"]?.modelCount).toBe(2);
  });

  it("keeps the reset time from the displayed Gemini variant quota", () => {
    const summary = __testExports.aggregateQuota({
      "gemini-3.5-flash-low": {
        displayName: "Gemini 3.5 Flash Low",
        quotaInfo: {
          remainingFraction: 1,
          resetTime: "2026-05-27T18:00:00Z",
        },
      },
      "gemini-3-flash-agent": {
        displayName: "Gemini 3 Flash Agent",
        quotaInfo: {
          remainingFraction: 0,
          resetTime: "2026-05-26T18:00:00Z",
        },
      },
    });

    expect(summary.groups["gemini-nonweekly"]?.remainingFraction).toBe(1);
    expect(summary.groups["gemini-nonweekly"]?.resetTime).toBe("2026-05-27T18:00:00Z");
  });
});
