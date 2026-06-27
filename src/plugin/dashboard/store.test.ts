import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { saveLog, getLogs, getStats, clearLogs } from "./store.js";

describe("Dashboard Store Layer", () => {
  beforeEach(async () => {
    await clearLogs();
  });

  afterEach(async () => {
    await clearLogs();
  });

  it("should save and retrieve logs successfully", async () => {
    const mockLog = {
      accountEmail: "test@gmail.com",
      modelName: "gemini-3.5-flash",
      requestedModel: "google/antigravity-gemini-3.5-flash",
      tokens: { input: 100, output: 200, total: 300, thinking: 50 },
      latencyMs: 150,
      statusCode: 200,
    };

    const saved = await saveLog(mockLog);
    expect(saved.id).toBeDefined();
    expect(saved.timestamp).toBeGreaterThan(0);
    expect(saved.accountEmail).toBe("test@gmail.com");

    const logs = await getLogs();
    expect(logs.length).toBe(1);
    expect(logs[0].id).toBe(saved.id);
    expect(logs[0].tokens.thinking).toBe(50);
  });

  it("should calculate correct aggregate statistics", async () => {
    await saveLog({
      accountEmail: "user1@gmail.com",
      modelName: "gemini-3.5-flash",
      requestedModel: "google/antigravity-gemini-3.5-flash",
      tokens: { input: 100, output: 200, total: 300 },
      latencyMs: 100,
      statusCode: 200,
    });

    await saveLog({
      accountEmail: "user1@gmail.com",
      modelName: "claude-sonnet",
      requestedModel: "google/antigravity-claude-sonnet",
      tokens: { input: 50, output: 50, total: 100 },
      latencyMs: 200,
      statusCode: 500, // failed request
    });

    const stats = await getStats();
    expect(stats.totalRequests).toBe(2);
    expect(stats.successRequests).toBe(1);
    expect(stats.failedRequests).toBe(1);
    expect(stats.totalTokens).toBe(400);
    expect(stats.averageLatencyMs).toBe(150); // (100 + 200) / 2

    // Grouping checks
    expect(stats.statsByModel["gemini-3.5-flash"]?.requests).toBe(1);
    expect(stats.statsByModel["claude-sonnet"]?.requests).toBe(1);
    expect(stats.statsByAccount["user1@gmail.com"]?.totalTokens).toBe(400);
  });
});
