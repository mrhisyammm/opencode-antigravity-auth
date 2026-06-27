import http from "node:http";
import { parse } from "node:url";
import { getLogs, getStats, clearLogs } from "./store.js";
import { createLogger } from "../logger.js";
import { AccountManager } from "../accounts.js";

const log = createLogger("dashboard-server");
let serverInstance: http.Server | null = null;

export function startDashboardServer(
  port: number,
  accountManager: AccountManager | null,
): http.Server {
  if (serverInstance) {
    log.info("Dashboard server already running");
    return serverInstance;
  }

  const server = http.createServer(async (req, res) => {
    // Enable CORS
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS, DELETE");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const parsedUrl = parse(req.url || "", true);
    const pathname = parsedUrl.pathname;

    try {
      // API Endpoints
      if (pathname === "/api/logs" && req.method === "GET") {
        const limit = parsedUrl.query.limit ? parseInt(parsedUrl.query.limit as string, 10) : 100;
        const logs = await getLogs(limit);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(logs));
        return;
      }

      if (pathname === "/api/stats" && req.method === "GET") {
        const stats = await getStats();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(stats));
        return;
      }

      if (pathname === "/api/logs" && req.method === "DELETE") {
        await clearLogs();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true }));
        return;
      }

      if (pathname === "/api/accounts" && req.method === "GET") {
        if (!accountManager) {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Account manager not initialized" }));
          return;
        }
        const accounts = accountManager.getAccountsSnapshot().map(acc => ({
          index: acc.index,
          email: acc.email,
          enabled: acc.enabled,
          cachedQuota: acc.cachedQuota,
          cachedQuotaUpdatedAt: acc.cachedQuotaUpdatedAt,
          coolingDownUntil: acc.coolingDownUntil,
          cooldownReason: acc.cooldownReason,
        }));
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(accounts));
        return;
      }

      // Serve Frontend Assets (Step 4 placeholder for now)
      if ((pathname === "/" || pathname === "/index.html") && req.method === "GET") {
        const htmlContent = getFrontendHtml();
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(htmlContent);
        return;
      }

      // 404 Not Found
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not Found" }));
    } catch (err) {
      log.error("Error handling dashboard request", { error: String(err) });
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Internal Server Error" }));
    }
  });

  server.listen(port, "127.0.0.1", () => {
    log.info(`Dashboard server listening on http://127.0.0.1:${port}`);
  });

  serverInstance = server;
  return server;
}

export function stopDashboardServer(): void {
  if (serverInstance) {
    serverInstance.close();
    serverInstance = null;
    log.info("Dashboard server stopped");
  }
}

// Frontend HTML placeholder (will be fully implemented in Step 4)
function getFrontendHtml(): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Antigravity Dashboard Placeholder</title>
</head>
<body>
  <h1>Antigravity Dashboard</h1>
  <p>Dashboard is under construction. API endpoints are ready at /api/logs, /api/stats, and /api/accounts.</p>
</body>
</html>`;
}
