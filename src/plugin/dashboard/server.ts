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
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Antigravity Dashboard</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/chartjs-adapter-date-fns"></script>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
  <script>
    tailwind.config = {
      theme: {
        extend: {
          fontFamily: { sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'] }
        }
      }
    }
  </script>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
    body { background: #09090b; color: #fafafa; }
    .card { background: #18181b; border: 1px solid #27272a; border-radius: 12px; }
    .card-hover:hover { border-color: #3f3f46; }
    .glass { background: rgba(24,24,27,0.8); backdrop-filter: blur(12px); }
    .progress-bar-bg { background: #27272a; }
    .scrollbar-thin::-webkit-scrollbar { width: 5px; height: 5px; }
    .scrollbar-thin::-webkit-scrollbar-track { background: transparent; }
    .scrollbar-thin::-webkit-scrollbar-thumb { background: #3f3f46; border-radius: 10px; }
    .scrollbar-thin::-webkit-scrollbar-thumb:hover { background: #52525b; }
    .tab-active { background: #27272a; color: #fafafa; border-color: #3b82f6; }
    .tab-inactive { color: #71717a; }
    .tab-inactive:hover { color: #a1a1aa; background: #18181b; }
    .filter-select {
      background: #18181b; border: 1px solid #27272a; color: #a1a1aa;
      font-size: 12px; padding: 6px 28px 6px 10px; border-radius: 8px;
      appearance: none; cursor: pointer;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2371717a' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
      background-repeat: no-repeat; background-position: right 8px center;
    }
    .filter-select:focus { outline: none; border-color: #3b82f6; color: #fafafa; }
    .filter-select:hover { border-color: #3f3f46; }
    .period-btn { padding: 5px 12px; font-size: 11px; border-radius: 6px; font-weight: 500; transition: all 0.15s; cursor: pointer; border: 1px solid transparent; }
    .period-btn.active { background: #3b82f6; color: white; }
    .period-btn:not(.active) { color: #71717a; }
    .period-btn:not(.active):hover { color: #a1a1aa; background: #27272a; }
    .stat-card { position: relative; overflow: hidden; }
    .stat-card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px; }
    .stat-card-blue::before { background: linear-gradient(90deg, #3b82f6, #60a5fa); }
    .stat-card-purple::before { background: linear-gradient(90deg, #8b5cf6, #a78bfa); }
    .stat-card-amber::before { background: linear-gradient(90deg, #f59e0b, #fbbf24); }
    .stat-card-emerald::before { background: linear-gradient(90deg, #10b981, #34d399); }
    .stat-card-rose::before { background: linear-gradient(90deg, #f43f5e, #fb7185); }
    .stat-card-cyan::before { background: linear-gradient(90deg, #06b6d4, #22d3ee); }
    .breakdown-row:hover { background: #1f1f23; }
    .pulse-dot { width: 6px; height: 6px; border-radius: 50%; background: #22c55e; animation: pulse 2s infinite; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
  </style>
</head>
<body class="min-h-screen flex flex-col font-sans antialiased">
  <!-- Header -->
  <header class="glass border-b border-zinc-800/50 px-6 py-3.5 flex items-center justify-between sticky top-0 z-40">
    <div class="flex items-center gap-3">
      <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
        <i class="fa-solid fa-bolt text-white text-sm"></i>
      </div>
      <div>
        <h1 class="text-sm font-bold text-white tracking-tight">Antigravity</h1>
        <p class="text-[10px] text-zinc-500 font-medium">Usage Analytics</p>
      </div>
    </div>
    <div class="flex items-center gap-2">
      <div class="flex items-center gap-1.5 mr-3">
        <div class="pulse-dot"></div>
        <span class="text-[10px] text-zinc-500 font-medium">Live</span>
      </div>
      <button onclick="clearAllLogs()" class="px-3 py-1.5 text-zinc-500 hover:text-rose-400 hover:bg-rose-500/5 rounded-lg text-[11px] font-medium transition-all border border-transparent hover:border-rose-500/20">
        <i class="fa-solid fa-trash-can mr-1.5"></i>Clear
      </button>
      <button onclick="refreshData(true)" class="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-[11px] font-medium transition-all border border-zinc-700/50">
        <i id="refresh-icon" class="fa-solid fa-arrows-rotate mr-1.5"></i>Refresh
      </button>
    </div>
  </header>

  <main class="flex-1 p-4 lg:p-6 max-w-[1440px] mx-auto w-full space-y-5">
    <!-- Filter Bar -->
    <div class="card p-3 flex flex-wrap items-center gap-3">
      <div class="flex items-center gap-1.5 text-zinc-500 text-[11px] font-semibold uppercase tracking-wider mr-1">
        <i class="fa-solid fa-filter text-[10px]"></i>Filters
      </div>
      <!-- Period Buttons -->
      <div class="flex items-center gap-1 bg-zinc-900 rounded-lg p-0.5">
        <button onclick="setPeriod('1h')" class="period-btn" data-period="1h">1H</button>
        <button onclick="setPeriod('24h')" class="period-btn" data-period="24h">24H</button>
        <button onclick="setPeriod('today')" class="period-btn active" data-period="today">Today</button>
        <button onclick="setPeriod('7d')" class="period-btn" data-period="7d">7D</button>
        <button onclick="setPeriod('30d')" class="period-btn" data-period="30d">30D</button>
        <button onclick="setPeriod('')" class="period-btn" data-period="">All</button>
      </div>
      <div class="h-5 w-px bg-zinc-800 hidden sm:block"></div>
      <!-- Model Filter -->
      <select id="filter-model" class="filter-select" onchange="refreshData()">
        <option value="">All Models</option>
      </select>
      <!-- Account Filter -->
      <select id="filter-account" class="filter-select" onchange="refreshData()">
        <option value="">All Accounts</option>
      </select>
      <!-- Status Filter -->
      <select id="filter-status" class="filter-select" onchange="refreshData()">
        <option value="">All Status</option>
        <option value="success">Success</option>
        <option value="failed">Failed</option>
      </select>
      <!-- Active Filters Indicator -->
      <div id="active-filters" class="hidden items-center gap-1.5 ml-auto">
        <span class="text-[10px] text-zinc-500 font-medium" id="filter-count">0 filters</span>
        <button onclick="clearFilters()" class="text-[10px] text-blue-400 hover:text-blue-300 font-medium transition">Clear all</button>
      </div>
    </div>

    <!-- Stats Grid -->
    <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      <div class="card stat-card stat-card-blue p-4">
        <div class="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider mb-2">Requests</div>
        <div id="stat-requests" class="text-xl font-bold text-white tabular-nums">0</div>
        <div id="stat-success-rate" class="text-[10px] text-emerald-400 font-medium mt-1">0% success</div>
      </div>
      <div class="card stat-card stat-card-purple p-4">
        <div class="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider mb-2">Total Tokens</div>
        <div id="stat-tokens" class="text-xl font-bold text-white tabular-nums">0</div>
        <div id="stat-tokens-breakdown" class="text-[10px] text-zinc-500 font-medium mt-1">0 in / 0 out</div>
      </div>
      <div class="card stat-card stat-card-cyan p-4">
        <div class="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider mb-2">Input Tokens</div>
        <div id="stat-input" class="text-xl font-bold text-white tabular-nums">0</div>
        <div class="text-[10px] text-zinc-500 font-medium mt-1">prompt tokens</div>
      </div>
      <div class="card stat-card stat-card-emerald p-4">
        <div class="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider mb-2">Output Tokens</div>
        <div id="stat-output" class="text-xl font-bold text-white tabular-nums">0</div>
        <div class="text-[10px] text-zinc-500 font-medium mt-1">completion tokens</div>
      </div>
      <div class="card stat-card stat-card-amber p-4">
        <div class="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider mb-2">Avg Latency</div>
        <div id="stat-latency" class="text-xl font-bold text-white tabular-nums">0ms</div>
        <div class="text-[10px] text-zinc-500 font-medium mt-1">response time</div>
      </div>
      <div class="card stat-card stat-card-rose p-4">
        <div class="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider mb-2">Failed</div>
        <div id="stat-failed" class="text-xl font-bold text-white tabular-nums">0</div>
        <div id="stat-failed-pct" class="text-[10px] text-zinc-500 font-medium mt-1">0% error rate</div>
      </div>
    </div>

    <!-- Charts Row -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <!-- Usage Timeline -->
      <div class="card p-4 lg:col-span-2">
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-xs font-semibold text-white flex items-center gap-2">
            <i class="fa-solid fa-chart-area text-blue-400 text-[10px]"></i>Token Usage Over Time
          </h3>
          <div class="flex items-center gap-1 bg-zinc-900 rounded-md p-0.5">
            <button onclick="setTimelineGrouping('hour')" class="text-[9px] px-2 py-0.5 rounded font-medium timeline-group-btn" data-group="hour">Hourly</button>
            <button onclick="setTimelineGrouping('day')" class="text-[9px] px-2 py-0.5 rounded font-medium timeline-group-btn active" data-group="day">Daily</button>
          </div>
        </div>
        <div class="relative h-[200px]">
          <canvas id="timelineChart"></canvas>
          <div id="timeline-no-data" class="absolute inset-0 flex items-center justify-center text-[11px] text-zinc-500">No data in selected period</div>
        </div>
      </div>
      <!-- Token Distribution Doughnut -->
      <div class="card p-4">
        <h3 class="text-xs font-semibold text-white flex items-center gap-2 mb-3">
          <i class="fa-solid fa-chart-pie text-purple-400 text-[10px]"></i>Token Distribution
        </h3>
        <div class="relative flex items-center justify-center h-[200px]">
          <canvas id="tokenChart" class="max-w-[180px] max-h-[180px]"></canvas>
          <div id="chart-no-data" class="absolute inset-0 flex items-center justify-center text-[11px] text-zinc-500">No data available</div>
        </div>
      </div>
    </div>

    <!-- Breakdown Tables Row -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <!-- Model Breakdown -->
      <div class="card p-4">
        <h3 class="text-xs font-semibold text-white flex items-center gap-2 mb-3">
          <i class="fa-solid fa-microchip text-blue-400 text-[10px]"></i>Model Breakdown
        </h3>
        <div class="overflow-x-auto scrollbar-thin">
          <table class="w-full text-left text-[11px]">
            <thead>
              <tr class="border-b border-zinc-800 text-zinc-500 text-[10px] font-semibold uppercase tracking-wider">
                <th class="py-2 px-2">Model</th>
                <th class="py-2 px-2 text-right">Requests</th>
                <th class="py-2 px-2 text-right">Input</th>
                <th class="py-2 px-2 text-right">Output</th>
                <th class="py-2 px-2 text-right">Total</th>
                <th class="py-2 px-2 text-right">Avg Latency</th>
              </tr>
            </thead>
            <tbody id="model-breakdown-tbody">
              <tr><td colspan="6" class="py-6 text-center text-zinc-600 text-[11px]">No model data</td></tr>
            </tbody>
          </table>
        </div>
      </div>
      <!-- Account Breakdown -->
      <div class="card p-4">
        <h3 class="text-xs font-semibold text-white flex items-center gap-2 mb-3">
          <i class="fa-solid fa-users text-teal-400 text-[10px]"></i>Account Breakdown
        </h3>
        <div class="overflow-x-auto scrollbar-thin">
          <table class="w-full text-left text-[11px]">
            <thead>
              <tr class="border-b border-zinc-800 text-zinc-500 text-[10px] font-semibold uppercase tracking-wider">
                <th class="py-2 px-2">Account</th>
                <th class="py-2 px-2 text-right">Requests</th>
                <th class="py-2 px-2 text-right">Input</th>
                <th class="py-2 px-2 text-right">Output</th>
                <th class="py-2 px-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody id="account-breakdown-tbody">
              <tr><td colspan="5" class="py-6 text-center text-zinc-600 text-[11px]">No account data</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Accounts Quota & Live Logs -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <!-- Accounts Quota -->
      <div class="card p-4">
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-xs font-semibold text-white flex items-center gap-2">
            <i class="fa-solid fa-id-card text-teal-400 text-[10px]"></i>Account Quotas
          </h3>
          <span id="stat-accounts-badge" class="text-[9px] bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full font-medium">0 accounts</span>
        </div>
        <div id="accounts-container" class="space-y-3 max-h-[400px] overflow-y-auto scrollbar-thin pr-1">
          <div class="text-center text-[11px] text-zinc-600 py-8">No account data yet</div>
        </div>
      </div>

      <!-- Live Traffic -->
      <div class="card p-4 lg:col-span-2 flex flex-col">
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-xs font-semibold text-white flex items-center gap-2">
            <i class="fa-solid fa-wave-square text-blue-400 text-[10px]"></i>Request Log
          </h3>
          <div class="flex items-center gap-2">
            <span id="log-count" class="text-[10px] text-zinc-500 font-medium">0 entries</span>
            <div class="flex items-center gap-1">
              <div class="pulse-dot"></div>
              <span class="text-[9px] text-zinc-600">3s</span>
            </div>
          </div>
        </div>
        <div class="flex-1 overflow-auto scrollbar-thin max-h-[400px]">
          <table class="w-full text-left text-[11px]">
            <thead class="sticky top-0 bg-zinc-900/95 backdrop-blur-sm z-10">
              <tr class="border-b border-zinc-800 text-zinc-500 text-[10px] font-semibold uppercase tracking-wider">
                <th class="py-2 px-2">Status</th>
                <th class="py-2 px-2">Model</th>
                <th class="py-2 px-2">Account</th>
                <th class="py-2 px-2 text-right">In / Out</th>
                <th class="py-2 px-2 text-right">Latency</th>
                <th class="py-2 px-2 text-right">Time</th>
              </tr>
            </thead>
            <tbody id="logs-tbody">
              <tr><td colspan="6" class="py-12 text-center text-zinc-600 text-[11px]">Waiting for traffic...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </main>

  <!-- Log Details Modal -->
  <div id="details-modal" class="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 hidden flex items-center justify-center p-4" onclick="if(event.target===this)closeModal()">
    <div class="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-lg overflow-hidden shadow-2xl">
      <div class="px-5 py-3.5 border-b border-zinc-800 flex justify-between items-center">
        <h4 class="font-semibold text-white text-xs flex items-center gap-2">
          <i class="fa-solid fa-circle-info text-blue-400"></i>Request Details
        </h4>
        <button onclick="closeModal()" class="text-zinc-500 hover:text-white transition w-6 h-6 flex items-center justify-center rounded hover:bg-zinc-800">
          <i class="fa-solid fa-xmark text-sm"></i>
        </button>
      </div>
      <div id="modal-content" class="p-5 space-y-3 text-xs text-zinc-300 max-h-[70vh] overflow-y-auto scrollbar-thin"></div>
      <div class="px-5 py-3 border-t border-zinc-800 flex justify-end">
        <button onclick="closeModal()" class="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-[11px] font-medium transition border border-zinc-700/50">Close</button>
      </div>
    </div>
  </div>

  <footer class="border-t border-zinc-900 py-2.5 text-center text-[10px] text-zinc-600">
    Antigravity auth plugin &middot; Data persisted locally
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
        if (b.dataset.group === g) { b.style.background = '#3b82f6'; b.style.color = '#fff'; }
        else { b.style.background = 'transparent'; b.style.color = '#71717a'; }
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
      if (isManual && icon) icon.classList.add('fa-spin');
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
      finally { if (isManual && icon) setTimeout(() => icon.classList.remove('fa-spin'), 500); }
    }

    // ===== Stats Cards =====
    function updateStats(s) {
      document.getElementById('stat-requests').textContent = fmtNum(s.totalRequests);
      const rate = s.totalRequests > 0 ? Math.round(s.successRequests / s.totalRequests * 100) : 100;
      const rateEl = document.getElementById('stat-success-rate');
      rateEl.textContent = rate + '% success';
      rateEl.className = 'text-[10px] font-medium mt-1 ' + (rate >= 90 ? 'text-emerald-400' : 'text-amber-400');
      document.getElementById('stat-tokens').textContent = fmtNum(s.totalTokens);
      document.getElementById('stat-tokens-breakdown').textContent = fmtNum(s.totalInputTokens) + ' in / ' + fmtNum(s.totalOutputTokens) + ' out';
      document.getElementById('stat-input').textContent = fmtNum(s.totalInputTokens);
      document.getElementById('stat-output').textContent = fmtNum(s.totalOutputTokens);
      document.getElementById('stat-latency').textContent = s.averageLatencyMs + 'ms';
      document.getElementById('stat-failed').textContent = fmtNum(s.failedRequests);
      const errRate = s.totalRequests > 0 ? Math.round(s.failedRequests / s.totalRequests * 100) : 0;
      document.getElementById('stat-failed-pct').textContent = errRate + '% error rate';
    }

    // ===== Model Breakdown =====
    function updateModelBreakdown(s) {
      const tbody = document.getElementById('model-breakdown-tbody');
      const models = Object.entries(s.statsByModel).sort((a,b) => b[1].totalTokens - a[1].totalTokens);
      if (models.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="py-6 text-center text-zinc-600 text-[11px]">No model data</td></tr>';
        return;
      }
      tbody.innerHTML = models.map(([name, m]) => {
        const shortName = name.replace('antigravity-', '');
        return '<tr class="breakdown-row border-b border-zinc-800/50 transition">'
          + '<td class="py-2 px-2 font-mono font-medium text-zinc-200 text-[10px]">' + shortName + '</td>'
          + '<td class="py-2 px-2 text-right text-zinc-300 tabular-nums">' + fmtNum(m.requests) + '</td>'
          + '<td class="py-2 px-2 text-right text-zinc-400 tabular-nums">' + fmtNum(m.inputTokens) + '</td>'
          + '<td class="py-2 px-2 text-right text-zinc-400 tabular-nums">' + fmtNum(m.outputTokens) + '</td>'
          + '<td class="py-2 px-2 text-right text-white font-semibold tabular-nums">' + fmtNum(m.totalTokens) + '</td>'
          + '<td class="py-2 px-2 text-right text-amber-400/80 tabular-nums">' + m.averageLatencyMs + 'ms</td>'
          + '</tr>';
      }).join('');
    }

    // ===== Account Breakdown =====
    function updateAccountBreakdown(s) {
      const tbody = document.getElementById('account-breakdown-tbody');
      const accs = Object.entries(s.statsByAccount).sort((a,b) => b[1].totalTokens - a[1].totalTokens);
      if (accs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="py-6 text-center text-zinc-600 text-[11px]">No account data</td></tr>';
        return;
      }
      tbody.innerHTML = accs.map(([email, a]) => {
        const short = email.split('@')[0];
        return '<tr class="breakdown-row border-b border-zinc-800/50 transition">'
          + '<td class="py-2 px-2 font-medium text-zinc-200" title="' + email + '">' + short + '</td>'
          + '<td class="py-2 px-2 text-right text-zinc-300 tabular-nums">' + fmtNum(a.requests) + '</td>'
          + '<td class="py-2 px-2 text-right text-zinc-400 tabular-nums">' + fmtNum(a.inputTokens) + '</td>'
          + '<td class="py-2 px-2 text-right text-zinc-400 tabular-nums">' + fmtNum(a.outputTokens) + '</td>'
          + '<td class="py-2 px-2 text-right text-white font-semibold tabular-nums">' + fmtNum(a.totalTokens) + '</td>'
          + '</tr>';
      }).join('');
    }

    // ===== Logs Table =====
    function updateLogsTable(logs) {
      const tbody = document.getElementById('logs-tbody');
      document.getElementById('log-count').textContent = logs.length + ' entries';
      if (logs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="py-12 text-center text-zinc-600 text-[11px]">No requests match the current filters</td></tr>';
        return;
      }
      tbody.innerHTML = logs.map(l => {
        const ok = l.statusCode >= 200 && l.statusCode < 300;
        const badge = ok
          ? '<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 text-[9px] font-semibold border border-emerald-500/20"><i class="fa-solid fa-check text-[7px]"></i>' + l.statusCode + '</span>'
          : '<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 text-[9px] font-semibold border border-rose-500/20"><i class="fa-solid fa-xmark text-[7px]"></i>' + l.statusCode + '</span>';
        const shortModel = l.modelName.replace('antigravity-', '');
        const shortEmail = l.accountEmail.split('@')[0];
        return '<tr onclick="showLogDetails(\\'' + l.id + '\\')" class="border-b border-zinc-800/30 hover:bg-zinc-800/30 transition cursor-pointer">'
          + '<td class="py-2 px-2">' + badge + '</td>'
          + '<td class="py-2 px-2 font-mono text-zinc-300 text-[10px] truncate max-w-[120px]">' + shortModel + '</td>'
          + '<td class="py-2 px-2 text-zinc-400">' + shortEmail + '</td>'
          + '<td class="py-2 px-2 text-right text-zinc-400 tabular-nums"><span class="text-zinc-500">' + fmtNum(l.tokens.input) + '</span> / <span class="text-zinc-300">' + fmtNum(l.tokens.output) + '</span></td>'
          + '<td class="py-2 px-2 text-right text-zinc-400 tabular-nums">' + (l.latencyMs > 5000 ? '<span class="text-amber-400">' : '<span>') + l.latencyMs + 'ms</span></td>'
          + '<td class="py-2 px-2 text-right text-zinc-500 tabular-nums">' + formatTime(l.timestamp) + '</td>'
          + '</tr>';
      }).join('');
    }

    // ===== Accounts Quota =====
    function updateAccounts(accounts) {
      const enabled = accounts.filter(a => a.enabled).length;
      document.getElementById('stat-accounts-badge').textContent = enabled + '/' + accounts.length + ' active';
      const container = document.getElementById('accounts-container');
      if (accounts.length === 0) {
        container.innerHTML = '<div class="text-center text-[11px] text-zinc-600 py-8">No account data yet</div>';
        return;
      }
      container.innerHTML = accounts.map(acc => {
        const isCooling = acc.coolingDownUntil && acc.coolingDownUntil > Date.now();
        const dot = isCooling ? '<span class="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block"></span>'
          : acc.enabled ? '<span class="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block"></span>'
          : '<span class="w-1.5 h-1.5 rounded-full bg-zinc-600 inline-block"></span>';
        const statusText = isCooling ? '<span class="text-amber-400 text-[9px]">cooling</span>'
          : acc.enabled ? '<span class="text-emerald-400 text-[9px]">active</span>'
          : '<span class="text-zinc-500 text-[9px]">disabled</span>';

        let quotaHtml = '';
        if (acc.cachedQuota) {
          const entries = [
            { name: "Claude 5h", key: "claude-nonweekly" },
            { name: "Claude Weekly", key: "claude-weekly" },
            { name: "Gemini 5h", key: "gemini-nonweekly" },
            { name: "Gemini Weekly", key: "gemini-weekly" }
          ];
          quotaHtml = '<div class="grid grid-cols-2 gap-x-3 gap-y-2 mt-2.5 pt-2 border-t border-zinc-800/50">';
          entries.forEach(e => {
            const q = acc.cachedQuota[e.key];
            if (!q) {
              quotaHtml += '<div class="text-[9px] text-zinc-600">' + e.name + ': N/A</div>';
            } else {
              const pct = Math.round((q.remainingFraction ?? 0) * 100);
              const color = pct < 20 ? '#f43f5e' : pct < 60 ? '#f59e0b' : '#10b981';
              const reset = q.resetTime ? formatResetTime(q.resetTime) : '';
              quotaHtml += '<div>'
                + '<div class="flex justify-between text-[9px] mb-0.5"><span class="text-zinc-500">' + e.name + '</span><span style="color:' + color + '">' + pct + '%</span></div>'
                + '<div class="progress-bar-bg rounded-full h-[3px] overflow-hidden"><div style="width:' + pct + '%;background:' + color + '" class="h-full rounded-full transition-all"></div></div>'
                + (reset ? '<div class="text-[8px] text-zinc-600 mt-0.5">' + reset + '</div>' : '')
                + '</div>';
            }
          });
          quotaHtml += '</div>';
        } else {
          quotaHtml = '<div class="text-[9px] text-zinc-600 mt-2 italic">No quota data cached</div>';
        }

        return '<div class="bg-zinc-900/50 border border-zinc-800/50 rounded-lg p-3">'
          + '<div class="flex items-center justify-between">'
          + '<span class="text-[11px] font-medium text-zinc-200 flex items-center gap-1.5">' + dot + ' ' + (acc.email || 'unknown') + '</span>'
          + statusText
          + '</div>'
          + quotaHtml
          + '</div>';
      }).join('');
    }

    // ===== Doughnut Chart =====
    const CHART_COLORS = [
      '#3b82f6','#8b5cf6','#f59e0b','#10b981','#f43f5e','#06b6d4','#ec4899','#84cc16','#6366f1','#14b8a6'
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
          data: { labels, datasets: [{ data, backgroundColor: CHART_COLORS.slice(0, models.length), borderWidth: 1, borderColor: '#18181b' }] },
          options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
              legend: { position: 'bottom', labels: { boxWidth: 8, padding: 6, font: { size: 9, family: 'Inter' }, color: '#71717a' } },
              tooltip: { backgroundColor: '#27272a', titleColor: '#fafafa', bodyColor: '#a1a1aa', borderColor: '#3f3f46', borderWidth: 1, padding: 8, cornerRadius: 8,
                callbacks: { label: ctx => ' ' + ctx.label + ': ' + fmtNum(ctx.raw) + ' tokens' }
              }
            },
            cutout: '70%'
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
        { label: 'Input', data: inputData, borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.08)', fill: true, tension: 0.3, pointRadius: 2, borderWidth: 1.5 },
        { label: 'Output', data: outputData, borderColor: '#8b5cf6', backgroundColor: 'rgba(139,92,246,0.08)', fill: true, tension: 0.3, pointRadius: 2, borderWidth: 1.5 },
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
              x: { type: 'time', time: { unit: timelineGrouping, displayFormats: { hour: 'HH:mm', day: 'MMM d' } }, grid: { color: '#27272a40' }, ticks: { color: '#52525b', font: { size: 9 } } },
              y: { beginAtZero: true, grid: { color: '#27272a40' }, ticks: { color: '#52525b', font: { size: 9 }, callback: v => fmtNum(v) } }
            },
            plugins: {
              legend: { labels: { boxWidth: 8, padding: 8, font: { size: 9 }, color: '#71717a' } },
              tooltip: { backgroundColor: '#27272a', titleColor: '#fafafa', bodyColor: '#a1a1aa', borderColor: '#3f3f46', borderWidth: 1, padding: 8, cornerRadius: 8,
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
      content.innerHTML = '<div class="flex items-center justify-center py-8 text-zinc-500"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Loading...</div>';
      try {
        const log = cachedLogs.find(l => l.id === logId);
        if (!log) { content.innerHTML = '<div class="text-rose-400">Not found</div>'; return; }
        const ok = log.statusCode >= 200 && log.statusCode < 300;
        const statusBadge = ok
          ? '<span class="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded text-[10px] font-bold">SUCCESS ' + log.statusCode + '</span>'
          : '<span class="bg-rose-500/10 text-rose-400 border border-rose-500/20 px-2 py-0.5 rounded text-[10px] font-bold">FAILED ' + log.statusCode + '</span>';
        content.innerHTML = ''
          + '<div class="space-y-2 bg-zinc-950/50 p-3 rounded-lg border border-zinc-800">'
          + '<div class="flex justify-between"><span class="text-zinc-500">Status</span>' + statusBadge + '</div>'
          + '<div class="flex justify-between"><span class="text-zinc-500">Model</span><span class="font-mono text-zinc-200">' + log.modelName + '</span></div>'
          + '<div class="flex justify-between"><span class="text-zinc-500">Requested</span><span class="font-mono text-zinc-300">' + log.requestedModel + '</span></div>'
          + '<div class="flex justify-between"><span class="text-zinc-500">Account</span><span class="text-zinc-300">' + log.accountEmail + '</span></div>'
          + '<div class="flex justify-between"><span class="text-zinc-500">Latency</span><span class="text-amber-400 font-semibold">' + log.latencyMs + 'ms</span></div>'
          + '<div class="flex justify-between"><span class="text-zinc-500">Time</span><span class="text-zinc-400">' + new Date(log.timestamp).toLocaleString() + '</span></div>'
          + '</div>'
          + '<div class="bg-zinc-950/30 p-3 rounded-lg border border-zinc-800/50">'
          + '<h5 class="font-semibold text-white mb-2 text-[11px]"><i class="fa-solid fa-ticket mr-1.5 text-purple-400"></i>Token Usage</h5>'
          + '<div class="grid grid-cols-2 gap-2">'
          + '<div class="flex justify-between text-zinc-400"><span>Input</span><span class="tabular-nums">' + fmtNumFull(log.tokens.input) + '</span></div>'
          + '<div class="flex justify-between text-zinc-400"><span>Output</span><span class="tabular-nums">' + fmtNumFull(log.tokens.output) + '</span></div>'
          + '<div class="flex justify-between text-zinc-400"><span>Thinking</span><span class="tabular-nums">' + (log.tokens.thinking ? fmtNumFull(log.tokens.thinking) : '0') + '</span></div>'
          + '<div class="flex justify-between text-white font-semibold"><span>Total</span><span class="text-purple-400 tabular-nums">' + fmtNumFull(log.tokens.total) + '</span></div>'
          + '</div></div>'
          + (!ok && log.error ? '<div class="bg-rose-950/20 border border-rose-900/50 text-rose-300 p-3 rounded-lg"><h5 class="font-semibold text-white mb-1 text-[11px]"><i class="fa-solid fa-triangle-exclamation mr-1.5 text-rose-400"></i>Error</h5><p class="font-mono text-[10px] whitespace-pre-wrap select-all">' + log.error + '</p></div>' : '');
      } catch(err) { content.innerHTML = '<div class="text-rose-400">Error: ' + err.message + '</div>'; }
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
    // Set default active state for timeline grouping buttons
    document.querySelectorAll('.timeline-group-btn').forEach(b => {
      if (b.dataset.group === timelineGrouping) { b.style.background = '#3b82f6'; b.style.color = '#fff'; }
      else { b.style.background = 'transparent'; b.style.color = '#71717a'; }
    });

    loadFilters();
    refreshData(false);
    setInterval(() => refreshData(false), 3000);
    setInterval(() => loadFilters(), 30000);
  </script>
</body>
</html>`;
}
