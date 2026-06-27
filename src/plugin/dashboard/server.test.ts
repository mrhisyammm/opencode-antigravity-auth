import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startDashboardServer, stopDashboardServer } from "./server.js";
import { saveLog, clearLogs } from "./store.js";

describe("Dashboard HTTP Server Layer", () => {
  const testPort = 27145; // Test port to avoid conflict

  beforeAll(async () => {
    await clearLogs();
    startDashboardServer(testPort, null);
  });

  afterAll(async () => {
    stopDashboardServer();
    await clearLogs();
  });

  it("should respond to GET /api/stats with correct JSON schema", async () => {
    const res = await fetch(`http://127.0.0.1:${testPort}/api/stats`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");

    const data = await res.json() as any;
    expect(data.totalRequests).toBe(0);
    expect(data.successRequests).toBe(0);
  });

  it("should respond to GET /api/logs with correct logs list", async () => {
    // Save a mock log
    await saveLog({
      accountEmail: "user@test.com",
      modelName: "gemini-3.5-flash",
      requestedModel: "google/antigravity-gemini-3.5-flash",
      tokens: { input: 10, output: 20, total: 30 },
      latencyMs: 50,
      statusCode: 200,
    });

    const res = await fetch(`http://127.0.0.1:${testPort}/api/logs`);
    expect(res.status).toBe(200);
    const logs = await res.json() as any[];
    expect(logs.length).toBe(1);
    expect(logs[0].accountEmail).toBe("user@test.com");
    expect(logs[0].tokens.total).toBe(30);
  });

  it("should return 404 for unknown endpoints", async () => {
    const res = await fetch(`http://127.0.0.1:${testPort}/api/invalid-endpoint`);
    expect(res.status).toBe(404);
  });
});
