import http from "node:http";
import { getLogs, getStats, clearLogs, getAvailableFilters } from "./store.js";
import type { LogFilter } from "./store.js";
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

    const urlObj = new URL(req.url || "", "http://localhost");
    const pathname = urlObj.pathname;

    try {
      // Build filter from query params (shared across /api/logs and /api/stats)
      const q = {
        model: urlObj.searchParams.get("model") || undefined,
        account: urlObj.searchParams.get("account") || undefined,
        status: urlObj.searchParams.get("status") || undefined,
        dateFrom: urlObj.searchParams.get("dateFrom") || undefined,
        dateTo: urlObj.searchParams.get("dateTo") || undefined,
        period: urlObj.searchParams.get("period") || undefined,
        limit: urlObj.searchParams.get("limit") || undefined,
      };
      const filter: LogFilter = {};
      if (q.model) filter.model = q.model;
      if (q.account) filter.account = q.account;
      if (q.status === "success" || q.status === "failed") filter.status = q.status;
      if (q.dateFrom) filter.dateFrom = parseInt(q.dateFrom, 10);
      if (q.dateTo) filter.dateTo = parseInt(q.dateTo, 10);
      // Period presets: "today", "7d", "30d", "24h"
      if (q.period) {
        const now = Date.now();
        switch (q.period) {
          case "1h": filter.dateFrom = now - 60 * 60 * 1000; break;
          case "24h": filter.dateFrom = now - 24 * 60 * 60 * 1000; break;
          case "today": {
            const d = new Date(); d.setHours(0, 0, 0, 0);
            filter.dateFrom = d.getTime(); break;
          }
          case "7d": filter.dateFrom = now - 7 * 24 * 60 * 60 * 1000; break;
          case "30d": filter.dateFrom = now - 30 * 24 * 60 * 60 * 1000; break;
        }
      }
      const hasFilter = Object.keys(filter).length > 0;

      // API Endpoints
      if (pathname === "/api/logs" && req.method === "GET") {
        const limit = q.limit ? parseInt(q.limit, 10) : 100;
        const logs = await getLogs(limit, hasFilter ? filter : undefined);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(logs));
        return;
      }

      if (pathname === "/api/stats" && req.method === "GET") {
        const stats = await getStats(hasFilter ? filter : undefined);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(stats));
        return;
      }

      if (pathname === "/api/filters" && req.method === "GET") {
        const filters = await getAvailableFilters();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(filters));
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

  server.on("error", (err) => {
    log.error("Dashboard server error", { error: String(err) });
  });

  server.listen(port, "127.0.0.1", () => {
    log.info(`Dashboard server listening on http://127.0.0.1:${port}`);
  });

  // Register process exit cleanups
  const cleanup = () => {
    stopDashboardServer();
  };
  process.once("exit", cleanup);
  process.once("SIGINT", cleanup);
  process.once("SIGTERM", cleanup);

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

// Frontend HTML page serving a rich, responsive dashboard UI
function getFrontendHtml(): string {
  return `<!DOCTYPE html>
<html class="dark" lang="en">
<head>
  <meta charset="utf-8"/>
  <meta content="width=device-width, initial-scale=1.0" name="viewport"/>
  <title>Antigravity Dashboard</title>
  <script src="https://cdn.tailwindcss.com?plugins=forms,container-queries"></script>
  <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&amp;display=swap" rel="stylesheet"/>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&amp;family=JetBrains+Mono:wght@400;500&amp;display=swap" rel="stylesheet"/>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/chartjs-adapter-date-fns"></script>
  <script id="tailwind-config">
    tailwind.config = {
      darkMode: "class",
      theme: {
        extend: {
          "colors": {
            "surface-container": "#171f33",
            "on-secondary-container": "#00311f",
            "secondary-container": "#00a572",
            "on-background": "#dae2fd",
            "secondary-fixed": "#6ffbbe",
            "on-primary-fixed-variant": "#003ea8",
            "on-secondary-fixed-variant": "#005236",
            "on-primary-container": "#eeefff",
            "outline": "#8d90a0",
            "on-secondary": "#003824",
            "on-primary": "#002a78",
            "primary-fixed": "#dbe1ff",
            "on-tertiary-fixed-variant": "#653e00",
            "on-primary-fixed": "#00174b",
            "error-container": "#93000a",
            "surface-container-low": "#131b2e",
            "on-secondary-fixed": "#002113",
            "on-surface-variant": "#c3c6d7",
            "surface-dim": "#0b1326",
            "secondary": "#4edea3",
            "on-tertiary": "#472a00",
            "inverse-on-surface": "#283044",
            "primary": "#b4c5ff",
            "surface-container-highest": "#2d3449",
            "on-surface": "#dae2fd",
            "inverse-primary": "#0053db",
            "on-error": "#690005",
            "primary-fixed-dim": "#b4c5ff",
            "surface-container-high": "#222a3d",
            "background": "#0b1326",
            "on-error-container": "#ffdad6",
            "on-tertiary-fixed": "#2a1700",
            "surface-bright": "#31394d",
            "surface-variant": "#2d3449",
            "surface-tint": "#b4c5ff",
            "on-tertiary-container": "#ffeedd",
            "surface": "#0b1326",
            "error": "#ffb4ab",
            "primary-container": "#2563eb",
            "outline-variant": "#434655",
            "tertiary-fixed": "#ffddb8",
            "tertiary-container": "#996100",
            "surface-container-lowest": "#060e20",
            "inverse-surface": "#dae2fd",
            "tertiary": "#ffb95f",
            "secondary-fixed-dim": "#4edea3",
            "tertiary-fixed-dim": "#ffb95f"
          },
          "borderRadius": {
            "DEFAULT": "0.25rem",
            "lg": "0.5rem",
            "xl": "0.75rem",
            "full": "9999px"
          },
          "spacing": {
            "margin-page": "40px",
            "stack-md": "16px",
            "stack-sm": "8px",
            "unit": "4px",
            "gutter": "24px",
            "container-padding": "24px",
            "stack-lg": "32px"
          },
          "fontFamily": {
            "display": ["Inter"],
            "label-caps": ["JetBrains Mono"],
            "body-sm": ["Inter"],
            "headline-lg-mobile": ["Inter"],
            "headline-lg": ["Inter"],
            "headline-md": ["Inter"],
            "body-lg": ["Inter"],
            "data-table": ["Inter"]
          },
          "fontSize": {
            "display": ["48px", { "lineHeight": "1.1", "letterSpacing": "-0.02em", "fontWeight": "600" }],
            "label-caps": ["11px", { "lineHeight": "1.2", "letterSpacing": "0.05em", "fontWeight": "500" }],
            "body-sm": ["14px", { "lineHeight": "1.5", "letterSpacing": "0em", "fontWeight": "400" }],
            "headline-lg-mobile": ["24px", { "lineHeight": "1.2", "letterSpacing": "-0.01em", "fontWeight": "600" }],
            "headline-lg": ["30px", { "lineHeight": "1.2", "letterSpacing": "-0.015em", "fontWeight": "600" }],
            "headline-md": ["20px", { "lineHeight": "1.4", "letterSpacing": "-0.01em", "fontWeight": "500" }],
            "body-lg": ["16px", { "lineHeight": "1.6", "letterSpacing": "0em", "fontWeight": "400" }],
            "data-table": ["13px", { "lineHeight": "1.4", "letterSpacing": "0.01em", "fontWeight": "400" }]
          }
        }
      }
    }
  </script>
  <style>
    body {
      background-color: #0b1326;
      color: #dae2fd;
      scroll-behavior: smooth;
    }
    /* Custom Scrollbar */
    ::-webkit-scrollbar {
      width: 6px;
      height: 6px;
    }
    ::-webkit-scrollbar-track {
      background: #0b1326; 
    }
    ::-webkit-scrollbar-thumb {
      background: #2d3449; 
      border-radius: 3px;
    }
    ::-webkit-scrollbar-thumb:hover {
      background: #434655; 
    }
    
    .stat-card-gradient {
      background: radial-gradient(circle at top right, rgba(37, 99, 235, 0.05), transparent 70%);
    }
    .pulse-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #4edea3;
      animation: pulse 2s infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }
    .period-btn {
      padding: 4px 10px;
      font-size: 11px;
      border-radius: 4px;
      font-weight: 500;
      transition: all 0.15s;
      cursor: pointer;
    }
    .period-btn.active {
      background: #2563eb;
      color: #fafafa;
    }
    .period-btn:not(.active) {
      color: #c3c6d7;
    }
    .period-btn:not(.active):hover {
      color: #fafafa;
      background: #222a3d;
    }
    .tab-active {
      color: #b4c5ff;
      border-bottom-color: #b4c5ff;
    }
    .tab-inactive {
      color: #c3c6d7;
    }
    .tab-inactive:hover {
      color: #b4c5ff;
    }
  </style>
</head>
<body class="antialiased min-h-screen flex flex-col text-body-lg font-body-sm bg-surface text-on-surface">
  <div class="flex-1 flex flex-col min-h-screen w-full">
    <!-- TopAppBar -->
    <header class="bg-surface/90 backdrop-blur-sm border-b border-outline-variant flex justify-between items-center h-16 px-margin-page sticky top-0 z-40 w-full">
      <div class="flex items-center gap-6 h-full">
        <div class="flex items-center gap-3 pr-6 border-r border-outline-variant py-2 h-full">
          <div class="w-8 h-8 rounded bg-primary-container flex items-center justify-center text-on-primary-container">
            <span class="material-symbols-outlined text-[20px]">rocket_launch</span>
          </div>
          <div class="flex flex-col justify-center">
            <h1 class="text-[16px] font-display font-semibold tracking-tight text-on-surface leading-tight">Antigravity</h1>
            <p class="text-[10px] font-label-caps text-on-surface-variant leading-tight">Dashboard</p>
          </div>
        </div>
        <div class="flex gap-6 h-full items-end pb-2">
          <a id="tab-dashboard" class="tab-btn text-primary font-medium border-b-2 border-primary px-1 text-body-sm cursor-pointer" onclick="switchTab('dashboard')">Dashboard</a>
          <a id="tab-analytics" class="tab-btn text-on-surface-variant hover:text-primary transition-colors duration-200 px-1 text-body-sm cursor-pointer" onclick="switchTab('analytics')">Analytics</a>
          <a id="tab-quotas" class="tab-btn text-on-surface-variant hover:text-primary transition-colors duration-200 px-1 text-body-sm cursor-pointer" onclick="switchTab('quotas')">Quotas</a>
          <a id="tab-logs" class="tab-btn text-on-surface-variant hover:text-primary transition-colors duration-200 px-1 text-body-sm cursor-pointer" onclick="switchTab('logs')">Logs</a>
        </div>
      </div>
      <div class="flex items-center gap-4">
        <button class="text-on-surface-variant hover:text-primary text-body-sm px-3 py-1 border border-outline-variant rounded transition-colors" onclick="refreshData(true)">
          <span class="flex items-center gap-1">
            <span id="refresh-icon" class="material-symbols-outlined text-[16px] inline-block">refresh</span>
            Refresh
          </span>
        </button>
        <button class="text-on-surface-variant hover:text-error text-body-sm px-3 py-1 border border-outline-variant rounded transition-colors" onclick="clearAllLogs()">Clear Logs</button>
        <div class="w-px h-6 bg-outline-variant mx-2"></div>
        <div class="flex items-center gap-1.5 mr-3">
          <div class="pulse-dot"></div>
          <span class="text-[10px] font-label-caps text-on-surface-variant leading-tight">Live</span>
        </div>
      </div>
    </header>

    <!-- Canvas -->
    <main class="flex-1 p-margin-page overflow-y-auto space-y-6">
      
      <!-- Global Filter Bar -->
      <div class="bg-surface-container border border-outline-variant rounded p-4 flex flex-wrap items-center gap-4">
        <div class="flex items-center gap-1.5 text-on-surface-variant text-[11px] font-label-caps uppercase tracking-wider mr-1">
          <span class="material-symbols-outlined text-[16px]">filter_list</span>Filters
        </div>
        <!-- Period Buttons -->
        <div class="flex items-center gap-1 bg-surface-container-low rounded p-1 border border-outline-variant/50">
          <button onclick="setPeriod('1h')" class="period-btn" data-period="1h">1H</button>
          <button onclick="setPeriod('24h')" class="period-btn" data-period="24h">24H</button>
          <button onclick="setPeriod('today')" class="period-btn active" data-period="today">Today</button>
          <button onclick="setPeriod('7d')" class="period-btn" data-period="7d">7D</button>
          <button onclick="setPeriod('30d')" class="period-btn" data-period="30d">30D</button>
          <button onclick="setPeriod('')" class="period-btn" data-period="">All</button>
        </div>
        <div class="h-6 w-px bg-outline-variant hidden sm:block"></div>
        <!-- Model Filter -->
        <select id="filter-model" class="bg-surface border border-outline-variant text-on-surface-variant text-[12px] rounded px-3 py-1 focus:outline-none focus:border-primary" onchange="refreshData()">
          <option value="">All Models</option>
        </select>
        <!-- Account Filter -->
        <select id="filter-account" class="bg-surface border border-outline-variant text-on-surface-variant text-[12px] rounded px-3 py-1 focus:outline-none focus:border-primary" onchange="refreshData()">
          <option value="">All Accounts</option>
        </select>
        <!-- Status Filter -->
        <select id="filter-status" class="bg-surface border border-outline-variant text-on-surface-variant text-[12px] rounded px-3 py-1 focus:outline-none focus:border-primary" onchange="refreshData()">
          <option value="">All Status</option>
          <option value="success">Success</option>
          <option value="failed">Failed</option>
        </select>
        <!-- Active Filters Indicator -->
        <div id="active-filters" class="hidden items-center gap-2 ml-auto">
          <span class="text-[11px] text-on-surface-variant font-medium" id="filter-count">0 filters</span>
          <button onclick="clearFilters()" class="text-[11px] text-primary hover:underline font-medium transition">Clear all</button>
        </div>
      </div>

      <!-- PAGE 1: DASHBOARD -->
      <section id="sec-dashboard" class="space-y-6">
        <div class="mb-2">
          <h2 class="text-headline-lg font-display text-on-surface">Dashboard</h2>
          <p class="text-on-surface-variant text-body-sm mt-1">Real-time telemetry and API usage metrics.</p>
        </div>
        <!-- Stats Grid -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-gutter">
          <div class="bg-surface-container border border-outline-variant rounded p-container-padding stat-card-gradient">
            <div class="text-label-caps font-label-caps text-on-surface-variant mb-2">REQUESTS</div>
            <div id="stat-requests" class="text-headline-md font-display text-on-surface tabular-nums">0</div>
            <div id="stat-success-rate" class="text-body-sm text-secondary mt-1 flex items-center gap-1">0% success</div>
          </div>
          <div class="bg-surface-container border border-outline-variant rounded p-container-padding">
            <div class="text-label-caps font-label-caps text-on-surface-variant mb-2">TOTAL TOKENS</div>
            <div id="stat-tokens" class="text-headline-md font-display text-on-surface tabular-nums">0</div>
            <div id="stat-tokens-breakdown" class="text-body-sm text-on-surface-variant mt-1">0 in / 0 out</div>
          </div>
          <div class="bg-surface-container border border-outline-variant rounded p-container-padding">
            <div class="text-label-caps font-label-caps text-on-surface-variant mb-2">INPUT TOKENS</div>
            <div id="stat-input" class="text-headline-md font-display text-on-surface tabular-nums">0</div>
            <div class="text-body-sm text-on-surface-variant mt-1">prompt tokens</div>
          </div>
          <div class="bg-surface-container border border-outline-variant rounded p-container-padding">
            <div class="text-label-caps font-label-caps text-on-surface-variant mb-2">OUTPUT TOKENS</div>
            <div id="stat-output" class="text-headline-md font-display text-on-surface tabular-nums">0</div>
            <div class="text-body-sm text-on-surface-variant mt-1">completion tokens</div>
          </div>
          <div class="bg-surface-container border border-outline-variant rounded p-container-padding">
            <div class="text-label-caps font-label-caps text-on-surface-variant mb-2">AVG LATENCY</div>
            <div id="stat-latency" class="text-headline-md font-display text-on-surface tabular-nums">0ms</div>
            <div class="text-body-sm text-on-surface-variant mt-1">response time</div>
          </div>
          <div class="bg-surface-container border border-outline-variant rounded p-container-padding">
            <div class="text-label-caps font-label-caps text-on-surface-variant mb-2">ERROR RATE</div>
            <div id="stat-failed" class="text-headline-md font-display text-error tabular-nums">0</div>
            <div id="stat-failed-pct" class="text-body-sm text-on-surface-variant mt-1">0% error rate</div>
          </div>
        </div>

        <!-- Charts Section -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-gutter">
          <!-- Timeline Area Chart -->
          <div class="lg:col-span-2 bg-surface-container border border-outline-variant rounded p-container-padding flex flex-col h-[380px]">
            <div class="flex justify-between items-center mb-4 pb-2 border-b border-outline-variant">
              <h3 class="text-body-lg font-medium text-on-surface flex items-center gap-2">
                <span class="material-symbols-outlined text-[18px]">timeline</span>Token Usage Over Time
              </h3>
              <div class="flex gap-2">
                <button onclick="setTimelineGrouping('hour')" class="px-2 py-1 text-label-caps font-label-caps bg-surface-container-high rounded text-on-surface timeline-group-btn" data-group="hour">Hourly</button>
                <button onclick="setTimelineGrouping('day')" class="px-2 py-1 text-label-caps font-label-caps text-on-surface-variant hover:bg-surface-container-high rounded transition-colors timeline-group-btn active" data-group="day">Daily</button>
              </div>
            </div>
            <div class="flex-1 relative w-full h-full min-h-0">
              <canvas id="timelineChart"></canvas>
              <div id="timeline-no-data" class="absolute inset-0 flex items-center justify-center text-[13px] text-on-surface-variant">No data in selected period</div>
            </div>
          </div>
          <!-- Doughnut Distribution Chart -->
          <div class="bg-surface-container border border-outline-variant rounded p-container-padding flex flex-col h-[380px]">
            <div class="mb-4 pb-2 border-b border-outline-variant">
              <h3 class="text-body-lg font-medium text-on-surface flex items-center gap-2">
                <span class="material-symbols-outlined text-[18px]">pie_chart</span>Token Distribution
              </h3>
            </div>
            <div class="flex-1 relative w-full h-full flex items-center justify-center min-h-0">
              <canvas id="tokenChart" class="max-w-[200px] max-h-[200px]"></canvas>
              <div id="chart-no-data" class="absolute inset-0 flex items-center justify-center text-[13px] text-on-surface-variant">No data available</div>
            </div>
          </div>
        </div>
      </section>

      <!-- PAGE 2: ANALYTICS -->
      <section id="sec-analytics" class="space-y-6 hidden">
        <div class="mb-2">
          <h2 class="text-headline-lg font-display text-on-surface">Analytics</h2>
          <p class="text-on-surface-variant text-body-sm mt-1">Deep dive into usage patterns and model performance.</p>
        </div>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-gutter">
          <!-- Model Breakdown Table -->
          <div class="bg-surface-container border border-outline-variant rounded p-container-padding">
            <h3 class="text-body-lg font-medium text-on-surface flex items-center gap-2 mb-4 pb-2 border-b border-outline-variant">
              <span class="material-symbols-outlined text-[18px]">memory</span>Model Breakdown
            </h3>
            <div class="overflow-x-auto">
              <table class="w-full text-left text-data-table">
                <thead>
                  <tr class="border-b border-outline-variant text-on-surface-variant text-[11px] font-label-caps uppercase tracking-wider">
                    <th class="py-2.5 px-2">Model</th>
                    <th class="py-2.5 px-2 text-right">Requests</th>
                    <th class="py-2.5 px-2 text-right">Input</th>
                    <th class="py-2.5 px-2 text-right">Output</th>
                    <th class="py-2.5 px-2 text-right">Total</th>
                    <th class="py-2.5 px-2 text-right">Avg Latency</th>
                  </tr>
                </thead>
                <tbody id="model-breakdown-tbody">
                  <tr><td colspan="6" class="py-12 text-center text-on-surface-variant text-[13px]">No model data</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Account Breakdown Table -->
          <div class="bg-surface-container border border-outline-variant rounded p-container-padding">
            <h3 class="text-body-lg font-medium text-on-surface flex items-center gap-2 mb-4 pb-2 border-b border-outline-variant">
              <span class="material-symbols-outlined text-[18px]">group</span>Account Breakdown
            </h3>
            <div class="overflow-x-auto">
              <table class="w-full text-left text-data-table">
                <thead>
                  <tr class="border-b border-outline-variant text-on-surface-variant text-[11px] font-label-caps uppercase tracking-wider">
                    <th class="py-2.5 px-2">Account</th>
                    <th class="py-2.5 px-2 text-right">Requests</th>
                    <th class="py-2.5 px-2 text-right">Input</th>
                    <th class="py-2.5 px-2 text-right">Output</th>
                    <th class="py-2.5 px-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody id="account-breakdown-tbody">
                  <tr><td colspan="5" class="py-12 text-center text-on-surface-variant text-[13px]">No account data</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      <!-- PAGE 3: QUOTAS -->
      <section id="sec-quotas" class="space-y-6 hidden">
        <div class="mb-2">
          <h2 class="text-headline-lg font-display text-on-surface">Account Quotas</h2>
          <p class="text-on-surface-variant text-body-sm mt-1">Resource allocation and rate limit statuses per active profile.</p>
        </div>
        <div class="bg-surface-container border border-outline-variant rounded p-container-padding">
          <div class="flex justify-between items-center mb-6 pb-2 border-b border-outline-variant">
            <h3 class="text-body-lg font-medium text-on-surface flex items-center gap-2">
              <span class="material-symbols-outlined text-[18px]">badge</span>Active OAuth Sessions
            </h3>
            <span id="stat-accounts-badge" class="text-[11px] font-label-caps bg-surface-container-high text-primary px-3 py-1 rounded-full">0/0 active</span>
          </div>
          <div id="accounts-container" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div class="col-span-full py-12 text-center text-on-surface-variant text-[13px]">No account data retrieved yet.</div>
          </div>
        </div>
      </section>

      <!-- PAGE 4: LOGS -->
      <section id="sec-logs" class="space-y-6 hidden">
        <div class="mb-2">
          <h2 class="text-headline-lg font-display text-on-surface">Request Logs</h2>
          <p class="text-on-surface-variant text-body-sm mt-1">Detailed history of intercepted API requests.</p>
        </div>
        <div class="bg-surface-container border border-outline-variant rounded p-container-padding flex flex-col">
          <div class="flex justify-between items-center mb-4 pb-2 border-b border-outline-variant">
            <h3 class="text-body-lg font-medium text-on-surface flex items-center gap-2">
              <span class="material-symbols-outlined text-[18px]">list_alt</span>Activity Stream
            </h3>
            <div class="flex items-center gap-3">
              <span id="log-count" class="text-[11px] font-label-caps text-on-surface-variant bg-surface-container-low px-2.5 py-1 border border-outline-variant/30 rounded">0 entries</span>
            </div>
          </div>
          <div class="overflow-x-auto min-h-[300px]">
            <table class="w-full text-left text-data-table">
              <thead>
                <tr class="border-b border-outline-variant text-on-surface-variant text-[11px] font-label-caps uppercase tracking-wider">
                  <th class="py-2.5 px-3">Status</th>
                  <th class="py-2.5 px-3">Model</th>
                  <th class="py-2.5 px-3">Account</th>
                  <th class="py-2.5 px-3 text-right">Tokens (In/Out)</th>
                  <th class="py-2.5 px-3 text-right">Latency</th>
                  <th class="py-2.5 px-3 text-right">Timestamp</th>
                </tr>
              </thead>
              <tbody id="logs-tbody" class="divide-y divide-outline-variant/20">
                <tr><td colspan="6" class="py-12 text-center text-on-surface-variant text-[13px]">Waiting for traffic...</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

    </main>
  </div>

  <!-- Log Details Modal -->
  <div id="details-modal" class="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 hidden flex items-center justify-center p-4" onclick="if(event.target===this)closeModal()">
    <div class="bg-surface-container border border-outline-variant rounded-xl w-full max-w-lg overflow-hidden shadow-2xl">
      <div class="px-5 py-4 border-b border-outline-variant flex justify-between items-center bg-surface-container-low">
        <h4 class="font-semibold text-white text-[13px] flex items-center gap-2 font-display">
          <span class="material-symbols-outlined text-primary text-[18px]">info</span>Request Details
        </h4>
        <button onclick="closeModal()" class="text-on-surface-variant hover:text-white transition w-8 h-8 flex items-center justify-center rounded hover:bg-surface-container-high">
          <span class="material-symbols-outlined text-[18px]">close</span>
        </button>
      </div>
      <div id="modal-content" class="p-5 space-y-4 text-[13px] text-on-surface-variant max-h-[70vh] overflow-y-auto"></div>
      <div class="px-5 py-3 border-t border-outline-variant flex justify-end bg-surface-container-low">
        <button onclick="closeModal()" class="px-4 py-1.5 bg-primary-container text-on-primary-container hover:bg-primary hover:text-on-primary rounded text-body-sm font-medium transition duration-200">Close</button>
      </div>
    </div>
  </div>

  <footer class="bg-surface border-t border-outline-variant/30 py-3 text-center text-[10px] font-label-caps text-on-surface-variant">
    Antigravity Auth Plugin &middot; precise, modern, high-performance &middot; Data persisted locally
  </footer>

  <script>
    // ===== State =====
    let tokenChart = null;
    let timelineChart = null;
    let currentPeriod = 'today';
    let timelineGrouping = 'day';
    let cachedLogs = [];

    // ===== Helpers =====
    function formatTime(ts) {
      return new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    }
    function formatDateTime(ts) {
      return new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
    }
    function formatResetTime(rt) {
      if (!rt) return 'N/A';
      const ms = Date.parse(rt) - Date.now();
      if (ms <= 0) return 'resetting...';
      const h = ms / 3600000;
      if (h >= 24) { const d = Math.floor(h/24), r = Math.floor(h%24); return r > 0 ? d+'d '+r+'h' : d+'d'; }
      const m = Math.ceil(ms / 60000);
      return m >= 60 ? Math.floor(m/60)+'h '+m%60+'m' : m+'m';
    }
    function fmtNum(n) {
      if (n >= 1e6) return (n/1e6).toFixed(1)+'M';
      if (n >= 1e3) return (n/1e3).toFixed(1)+'K';
      return n.toString();
    }
    function fmtNumFull(n) {
      return n.toLocaleString();
    }

    // ===== Tab Switcher =====
    function switchTab(tabId) {
      document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('text-primary', 'font-medium', 'border-b-2', 'border-primary');
        btn.classList.add('text-on-surface-variant');
      });
      const activeBtn = document.getElementById('tab-' + tabId);
      if (activeBtn) {
        activeBtn.classList.add('text-primary', 'font-medium', 'border-b-2', 'border-primary');
        activeBtn.classList.remove('text-on-surface-variant');
      }

      ['dashboard', 'analytics', 'quotas', 'logs'].forEach(sec => {
        const el = document.getElementById('sec-' + sec);
        if (el) {
          if (sec === tabId) el.classList.remove('hidden');
          else el.classList.add('hidden');
        }
      });
    }

    // ===== Filters =====
    function buildQueryString() {
      const params = new URLSearchParams();
      if (currentPeriod) params.set('period', currentPeriod);
      const model = document.getElementById('filter-model').value;
      const account = document.getElementById('filter-account').value;
      const status = document.getElementById('filter-status').value;
      if (model) params.set('model', model);
      if (account) params.set('account', account);
      if (status) params.set('status', status);
      return params.toString();
    }

    function setPeriod(p) {
      currentPeriod = p;
      document.querySelectorAll('.period-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.period === p);
      });
      refreshData();
    }

    // Interactive function mock to reset filters
    function clearFilters() {
      currentPeriod = 'today';
      document.getElementById('filter-model').value = '';
      document.getElementById('filter-account').value = '';
      document.getElementById('filter-status').value = '';
      document.querySelectorAll('.period-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.period === 'today');
      });
      refreshData();
    }

    function updateFilterIndicator() {
      let count = 0;
      if (currentPeriod && currentPeriod !== 'today') count++;
      if (document.getElementById('filter-model').value) count++;
      if (document.getElementById('filter-account').value) count++;
      if (document.getElementById('filter-status').value) count++;
      const el = document.getElementById('active-filters');
      if (count > 0) {
        el.classList.remove('hidden');
        el.classList.add('flex');
        document.getElementById('filter-count').textContent = count + ' filter' + (count > 1 ? 's' : '');
      } else {
        el.classList.add('hidden');
        el.classList.remove('flex');
      }
    }

    function setTimelineGrouping(g) {
      timelineGrouping = g;
      document.querySelectorAll('.timeline-group-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.group === g);
      });
      updateTimelineChart(cachedLogs);
    }

    // ===== Load filter options =====
    async function loadFilters() {
      try {
        const filters = await fetch('/api/filters').then(r => r.json());
        const modelSel = document.getElementById('filter-model');
        const accountSel = document.getElementById('filter-account');
        const currentModel = modelSel.value;
        const currentAccount = accountSel.value;
        modelSel.innerHTML = '<option value="">All Models</option>' + filters.models.map(m =>
          '<option value="'+m+'"' + (m === currentModel ? ' selected' : '') + '>'+m+'</option>'
        ).join('');
        accountSel.innerHTML = '<option value="">All Accounts</option>' + filters.accounts.map(a =>
          '<option value="'+a+'"' + (a === currentAccount ? ' selected' : '') + '>'+a.split("@")[0]+'</option>'
        ).join('');
      } catch(e) { console.error('Failed to load filters:', e); }
    }

    // ===== Data Fetching =====
    async function refreshData(isManual = false) {
      const icon = document.getElementById('refresh-icon');
      if (isManual && icon) icon.classList.add('animate-spin');
      updateFilterIndicator();
      try {
        const qs = buildQueryString();
        const [stats, logs, accounts] = await Promise.all([
          fetch('/api/stats?' + qs).then(r => r.json()),
          fetch('/api/logs?limit=500&' + qs).then(r => r.json()),
          fetch('/api/accounts').then(r => r.json())
        ]);
        cachedLogs = logs;
        updateStats(stats);
        updateModelBreakdown(stats);
        updateAccountBreakdown(stats);
        updateLogsTable(logs);
        updateAccounts(accounts);
        updateDoughnut(stats);
        updateTimelineChart(logs);
      } catch(err) { console.error('Refresh failed:', err); }
      finally { if (isManual && icon) setTimeout(() => icon.classList.remove('animate-spin'), 500); }
    }

    // ===== Stats Cards =====
    function updateStats(s) {
      document.getElementById('stat-requests').textContent = fmtNum(s.totalRequests);
      const rate = s.totalRequests > 0 ? Math.round(s.successRequests / s.totalRequests * 100) : 100;
      const rateEl = document.getElementById('stat-success-rate');
      rateEl.textContent = rate + '% success';
      rateEl.className = 'text-body-sm mt-1 ' + (rate >= 90 ? 'text-secondary' : 'text-tertiary');
      document.getElementById('stat-tokens').textContent = fmtNum(s.totalTokens);
      document.getElementById('stat-tokens-breakdown').textContent = fmtNum(s.totalInputTokens) + ' in / ' + fmtNum(s.totalOutputTokens) + ' out';
      document.getElementById('stat-input').textContent = fmtNum(s.totalInputTokens);
      document.getElementById('stat-output').textContent = fmtNum(s.totalOutputTokens);
      document.getElementById('stat-latency').textContent = s.averageLatencyMs + 'ms';
      document.getElementById('stat-failed').textContent = fmtNum(s.failedRequests);
      const errRate = s.totalRequests > 0 ? (s.failedRequests / s.totalRequests * 100).toFixed(2) : '0.00';
      document.getElementById('stat-failed-pct').textContent = errRate + '% error rate';
    }

    // ===== Model Breakdown =====
    function updateModelBreakdown(s) {
      const tbody = document.getElementById('model-breakdown-tbody');
      const models = Object.entries(s.statsByModel).sort((a,b) => b[1].totalTokens - a[1].totalTokens);
      if (models.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="py-12 text-center text-on-surface-variant text-[13px]">No model data</td></tr>';
        return;
      }
      tbody.innerHTML = models.map(([name, m]) => {
        const shortName = name.replace('antigravity-', '');
        return '<tr class="border-b border-outline-variant/30 hover:bg-surface-container-high transition">'
          + '<td class="py-3 px-2 font-mono text-on-surface text-[12px]">' + shortName + '</td>'
          + '<td class="py-3 px-2 text-right text-on-surface-variant font-label-caps">' + fmtNum(m.requests) + '</td>'
          + '<td class="py-3 px-2 text-right text-on-surface-variant font-label-caps">' + fmtNum(m.inputTokens) + '</td>'
          + '<td class="py-3 px-2 text-right text-on-surface-variant font-label-caps">' + fmtNum(m.outputTokens) + '</td>'
          + '<td class="py-3 px-2 text-right text-on-surface font-semibold font-label-caps">' + fmtNum(m.totalTokens) + '</td>'
          + '<td class="py-3 px-2 text-right text-tertiary font-label-caps">' + m.averageLatencyMs + 'ms</td>'
          + '</tr>';
      }).join('');
    }

    // ===== Account Breakdown =====
    function updateAccountBreakdown(s) {
      const tbody = document.getElementById('account-breakdown-tbody');
      const accs = Object.entries(s.statsByAccount).sort((a,b) => b[1].totalTokens - a[1].totalTokens);
      if (accs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="py-12 text-center text-on-surface-variant text-[13px]">No account data</td></tr>';
        return;
      }
      tbody.innerHTML = accs.map(([email, a]) => {
        const short = email.split('@')[0];
        return '<tr class="border-b border-outline-variant/30 hover:bg-surface-container-high transition">'
          + '<td class="py-3 px-2 text-on-surface" title="' + email + '">' + short + '</td>'
          + '<td class="py-3 px-2 text-right text-on-surface-variant font-label-caps">' + fmtNum(a.requests) + '</td>'
          + '<td class="py-3 px-2 text-right text-on-surface-variant font-label-caps">' + fmtNum(a.inputTokens) + '</td>'
          + '<td class="py-3 px-2 text-right text-on-surface-variant font-label-caps">' + fmtNum(a.outputTokens) + '</td>'
          + '<td class="py-3 px-2 text-right text-on-surface font-semibold font-label-caps">' + fmtNum(a.totalTokens) + '</td>'
          + '</tr>';
      }).join('');
    }

    // ===== Logs Table =====
    function updateLogsTable(logs) {
      const tbody = document.getElementById('logs-tbody');
      document.getElementById('log-count').textContent = logs.length + ' entries';
      if (logs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="py-12 text-center text-on-surface-variant text-[13px]">No requests match the current filters</td></tr>';
        return;
      }
      tbody.innerHTML = logs.map(l => {
        const ok = l.statusCode >= 200 && l.statusCode < 300;
        const badge = ok
          ? '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-secondary-container/20 text-secondary text-[11px] font-medium border border-secondary-container/40"><span class="w-1.5 h-1.5 rounded-full bg-secondary"></span>' + l.statusCode + '</span>'
          : '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-error-container/20 text-error text-[11px] font-medium border border-error-container/40"><span class="w-1.5 h-1.5 rounded-full bg-error"></span>' + l.statusCode + '</span>';
        const shortModel = l.modelName.replace('antigravity-', '');
        const shortEmail = l.accountEmail.split('@')[0];
        return '<tr onclick="showLogDetails(\'' + l.id + '\')" class="hover:bg-surface-container-high transition cursor-pointer border-b border-outline-variant/20">'
          + '<td class="py-3 px-3">' + badge + '</td>'
          + '<td class="py-3 px-3 font-mono text-on-surface text-[12px] truncate max-w-[150px]">' + shortModel + '</td>'
          + '<td class="py-3 px-3 text-on-surface-variant">' + shortEmail + '</td>'
          + '<td class="py-3 px-3 text-right text-on-surface-variant font-label-caps"><span class="text-outline">' + fmtNum(l.tokens.input) + '</span> / <span class="text-on-surface">' + fmtNum(l.tokens.output) + '</span></td>'
          + '<td class="py-3 px-3 text-right text-on-surface font-label-caps">' + (l.latencyMs > 5000 ? '<span class="text-tertiary">' : '<span>') + l.latencyMs + 'ms</span></td>'
          + '<td class="py-3 px-3 text-right text-on-surface-variant font-label-caps">' + formatTime(l.timestamp) + '</td>'
          + '</tr>';
      }).join('');
    }

    // ===== Accounts Quota =====
    function updateAccounts(accounts) {
      const enabled = accounts.filter(a => a.enabled).length;
      document.getElementById('stat-accounts-badge').textContent = enabled + '/' + accounts.length + ' active';
      const container = document.getElementById('accounts-container');
      if (accounts.length === 0) {
        container.innerHTML = '<div class="col-span-full py-12 text-center text-on-surface-variant text-[13px]">No account data yet</div>';
        return;
      }
      container.innerHTML = accounts.map(acc => {
        const isCooling = acc.coolingDownUntil && acc.coolingDownUntil > Date.now();
        const dot = isCooling ? '<span class="w-2.5 h-2.5 rounded-full bg-tertiary inline-block"></span>'
          : acc.enabled ? '<span class="w-2.5 h-2.5 rounded-full bg-secondary inline-block"></span>'
          : '<span class="w-2.5 h-2.5 rounded-full bg-outline inline-block"></span>';
        const statusText = isCooling ? '<span class="text-tertiary text-[11px] font-label-caps uppercase tracking-wider">cooling down</span>'
          : acc.enabled ? '<span class="text-secondary text-[11px] font-label-caps uppercase tracking-wider">active</span>'
          : '<span class="text-on-surface-variant text-[11px] font-label-caps uppercase tracking-wider">disabled</span>';

        let quotaHtml = '';
        if (acc.cachedQuota) {
          const entries = [
            { name: "Claude 5-Hour Limit", key: "claude-nonweekly" },
            { name: "Claude Weekly Limit", key: "claude-weekly" },
            { name: "Gemini 5-Hour Limit", key: "gemini-nonweekly" },
            { name: "Gemini Weekly Limit", key: "gemini-weekly" }
          ];
          quotaHtml = '<div class="space-y-3.5 mt-4 pt-3.5 border-t border-outline-variant/30">';
          entries.forEach(e => {
            const q = acc.cachedQuota[e.key];
            if (!q) {
              quotaHtml += '<div class="flex justify-between text-[11px] text-on-surface-variant font-label-caps"><span>' + e.name + '</span><span class="text-outline">N/A</span></div>';
            } else {
              const pct = Math.round((q.remainingFraction ?? 0) * 100);
              const color = pct < 20 ? '#ffb4ab' : pct < 60 ? '#ffb95f' : '#4edea3';
              const reset = q.resetTime ? formatResetTime(q.resetTime) : '';
              quotaHtml += '<div>'
                + '<div class="flex justify-between text-[11px] mb-1 font-label-caps"><span class="text-on-surface-variant">' + e.name + '</span><span style="color:' + color + '">' + pct + '%</span></div>'
                + '<div class="bg-surface-container-highest rounded-full h-1 overflow-hidden"><div style="width:' + pct + '%;background:' + color + '" class="h-full rounded-full transition-all"></div></div>'
                + (reset ? '<div class="text-[10px] text-outline mt-1 font-label-caps">Resets in ' + reset + '</div>' : '')
                + '</div>';
            }
          });
          quotaHtml += '</div>';
        } else {
          quotaHtml = '<div class="text-[11px] text-on-surface-variant mt-4 italic text-center">No quota data cached. Trigger a request or quota check to load.</div>';
        }

        return '<div class="bg-surface-container border border-outline-variant rounded p-container-padding flex flex-col justify-between">'
          + '<div>'
          + '<div class="flex items-center justify-between">'
          + '<span class="text-[13px] font-medium text-on-surface flex items-center gap-2">' + dot + ' ' + (acc.email || 'unknown') + '</span>'
          + statusText
          + '</div>'
          + quotaHtml
          + '</div>'
          + '</div>';
      }).join('');
    }

    // ===== Doughnut Chart =====
    const CHART_COLORS = [
      '#2563eb', '#4edea3', '#ffb95f', '#ffb4ab', '#b4c5ff', '#00a572', '#996100', '#93000a', '#dae2fd', '#434655'
    ];
    function updateDoughnut(stats) {
      const ctx = document.getElementById('tokenChart');
      const noData = document.getElementById('chart-no-data');
      const models = Object.keys(stats.statsByModel);
      if (models.length === 0) {
        ctx.classList.add('hidden'); noData.classList.remove('hidden');
        return;
      }
      ctx.classList.remove('hidden'); noData.classList.add('hidden');
      const data = models.map(m => stats.statsByModel[m].totalTokens);
      const labels = models.map(m => m.replace('antigravity-', ''));
      if (tokenChart) {
        tokenChart.data.labels = labels;
        tokenChart.data.datasets[0].data = data;
        tokenChart.data.datasets[0].backgroundColor = CHART_COLORS.slice(0, models.length);
        tokenChart.update();
      } else {
        tokenChart = new Chart(ctx, {
          type: 'doughnut',
          data: { labels, datasets: [{ data, backgroundColor: CHART_COLORS.slice(0, models.length), borderWidth: 0, hoverOffset: 4 }] },
          options: {
            responsive: true, maintainAspectRatio: false,
            cutout: '75%',
            plugins: {
              legend: { position: 'bottom', labels: { boxWidth: 10, padding: 6, font: { size: 9, family: 'Inter' }, color: '#c3c6d7', usePointStyle: true } },
              tooltip: { backgroundColor: '#131b2e', titleColor: '#dae2fd', bodyColor: '#c3c6d7', borderColor: '#434655', borderWidth: 1, padding: 8, cornerRadius: 4,
                callbacks: { label: ctx => ' ' + ctx.label + ': ' + fmtNum(ctx.raw) + ' tokens' }
              }
            }
          }
        });
      }
    }

    // ===== Timeline Chart =====
    function updateTimelineChart(logs) {
      const canvas = document.getElementById('timelineChart');
      const noData = document.getElementById('timeline-no-data');
      if (logs.length === 0) {
        canvas.classList.add('hidden'); noData.classList.remove('hidden');
        if (timelineChart) { timelineChart.destroy(); timelineChart = null; }
        return;
      }
      canvas.classList.remove('hidden'); noData.classList.add('hidden');

      // Bucket logs by time
      const buckets = {};
      const sortedLogs = [...logs].sort((a,b) => a.timestamp - b.timestamp);
      sortedLogs.forEach(l => {
        const d = new Date(l.timestamp);
        let key;
        if (timelineGrouping === 'hour') {
          d.setMinutes(0, 0, 0);
          key = d.getTime();
        } else {
          d.setHours(0, 0, 0, 0);
          key = d.getTime();
        }
        if (!buckets[key]) buckets[key] = { input: 0, output: 0, thinking: 0, requests: 0 };
        buckets[key].input += (l.tokens.input || 0);
        buckets[key].output += (l.tokens.output || 0);
        buckets[key].thinking += (l.tokens.thinking || 0);
        buckets[key].requests++;
      });

      const times = Object.keys(buckets).map(Number).sort((a,b) => a - b);
      const inputData = times.map(t => ({ x: t, y: buckets[t].input }));
      const outputData = times.map(t => ({ x: t, y: buckets[t].output }));

      const datasets = [
        { label: 'Output Tokens', data: outputData, borderColor: '#2563eb', backgroundColor: 'rgba(37, 99, 235, 0.08)', fill: true, tension: 0.4, pointRadius: 0, pointHoverRadius: 4, borderWidth: 2 },
        { label: 'Input Tokens', data: inputData, borderColor: '#4edea3', backgroundColor: 'rgba(78, 222, 163, 0.08)', fill: true, tension: 0.4, pointRadius: 0, pointHoverRadius: 4, borderWidth: 2 },
      ];

      if (timelineChart) {
        timelineChart.data.datasets = datasets;
        timelineChart.options.scales.x.time.unit = timelineGrouping;
        timelineChart.update();
      } else {
        timelineChart = new Chart(canvas, {
          type: 'line',
          data: { datasets },
          options: {
            responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
            scales: {
              x: { type: 'time', time: { unit: timelineGrouping, displayFormats: { hour: 'HH:mm', day: 'MMM d' } }, grid: { display: false, color: '#2d3449' }, ticks: { color: '#8d90a0', font: { size: 9 } } },
              y: { beginAtZero: true, grid: { color: '#2d3449', borderDash: [4, 4] }, ticks: { color: '#8d90a0', font: { size: 9 }, callback: v => fmtNum(v) } }
            },
            plugins: {
              legend: { position: 'top', labels: { boxWidth: 12, padding: 8, font: { size: 9 }, color: '#c3c6d7', usePointStyle: true } },
              tooltip: { backgroundColor: '#131b2e', titleColor: '#dae2fd', bodyColor: '#c3c6d7', borderColor: '#434655', borderWidth: 1, padding: 8, cornerRadius: 4,
                callbacks: { label: ctx => ' ' + ctx.dataset.label + ': ' + fmtNum(ctx.raw.y) + ' tokens' }
              }
            }
          }
        });
      }
    }

    // ===== Modal =====
    async function showLogDetails(logId) {
      const modal = document.getElementById('details-modal');
      const content = document.getElementById('modal-content');
      modal.classList.remove('hidden');
      content.innerHTML = '<div class="flex items-center justify-center py-8 text-on-surface-variant"><span class="material-symbols-outlined animate-spin mr-2">progress_activity</span>Loading details...</div>';
      try {
        const log = cachedLogs.find(l => l.id === logId);
        if (!log) { content.innerHTML = '<div class="text-error">Log not found</div>'; return; }
        const ok = log.statusCode >= 200 && log.statusCode < 300;
        const statusBadge = ok
          ? '<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-secondary-container/20 text-secondary text-[11px] font-semibold border border-secondary-container/40"><span class="w-1.5 h-1.5 rounded-full bg-secondary"></span>SUCCESS ' + log.statusCode + '</span>'
          : '<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-error-container/20 text-error text-[11px] font-semibold border border-error-container/40"><span class="w-1.5 h-1.5 rounded-full bg-error"></span>FAILED ' + log.statusCode + '</span>';
        content.innerHTML = ''
          + '<div class="space-y-2 bg-surface-container-low p-3.5 rounded border border-outline-variant/40">'
          + '<div class="flex justify-between items-center"><span class="text-on-surface-variant font-label-caps text-[10px]">Status</span>' + statusBadge + '</div>'
          + '<div class="flex justify-between items-center"><span class="text-on-surface-variant font-label-caps text-[10px]">Model</span><span class="font-mono text-on-surface font-semibold text-[12px]">' + log.modelName + '</span></div>'
          + '<div class="flex justify-between items-center"><span class="text-on-surface-variant font-label-caps text-[10px]">Requested</span><span class="font-mono text-on-surface-variant text-[11px]">' + log.requestedModel + '</span></div>'
          + '<div class="flex justify-between items-center"><span class="text-on-surface-variant font-label-caps text-[10px]">Account</span><span class="text-on-surface">' + log.accountEmail + '</span></div>'
          + '<div class="flex justify-between items-center"><span class="text-on-surface-variant font-label-caps text-[10px]">Latency</span><span class="text-tertiary font-semibold">' + log.latencyMs + 'ms</span></div>'
          + '<div class="flex justify-between items-center"><span class="text-on-surface-variant font-label-caps text-[10px]">Time</span><span class="text-on-surface-variant font-label-caps">' + new Date(log.timestamp).toLocaleString() + '</span></div>'
          + '</div>'
          + '<div class="bg-surface-container-low p-3.5 rounded border border-outline-variant/40">'
          + '<h5 class="font-semibold text-white mb-3 text-[12px] flex items-center gap-1.5 font-display"><span class="material-symbols-outlined text-[18px]">receipt_long</span>Token Accounting</h5>'
          + '<div class="grid grid-cols-2 gap-x-4 gap-y-2 font-label-caps text-[11px]">'
          + '<div class="flex justify-between text-on-surface-variant"><span>Input</span><span class="text-on-surface">' + fmtNumFull(log.tokens.input) + '</span></div>'
          + '<div class="flex justify-between text-on-surface-variant"><span>Output</span><span class="text-on-surface">' + fmtNumFull(log.tokens.output) + '</span></div>'
          + '<div class="flex justify-between text-on-surface-variant"><span>Thinking</span><span class="text-outline">' + (log.tokens.thinking ? fmtNumFull(log.tokens.thinking) : '0') + '</span></div>'
          + '<div class="flex justify-between text-white font-bold border-t border-outline-variant/30 pt-2 col-span-2"><span>Total</span><span class="text-primary">' + fmtNumFull(log.tokens.total) + '</span></div>'
          + '</div></div>'
          + (!ok && log.error ? '<div class="bg-error-container/20 border border-error-container/40 text-error p-3.5 rounded"><h5 class="font-semibold text-white mb-2 text-[12px] flex items-center gap-1.5"><span class="material-symbols-outlined text-[18px]">warning</span>Error Trace</h5><p class="font-mono text-[11px] whitespace-pre-wrap select-all bg-surface-container-lowest p-2 rounded border border-outline-variant/20">' + log.error + '</p></div>' : '');
      } catch(err) { content.innerHTML = '<div class="text-error">Error: ' + err.message + '</div>'; }
    }
    function closeModal() { document.getElementById('details-modal').classList.add('hidden'); }

    // ===== Clear =====
    async function clearAllLogs() {
      if (confirm('Delete all traffic logs and reset statistics?')) {
        try { const r = await fetch('/api/logs', { method: 'DELETE' }); if (r.ok) refreshData(); }
        catch(e) { console.error('Failed:', e); }
      }
    }

    // ===== Init =====
    loadFilters();
    refreshData(false);
    setInterval(() => refreshData(false), 3000);
    setInterval(() => loadFilters(), 30000);
  </script>
</body>
</html>`;
}
