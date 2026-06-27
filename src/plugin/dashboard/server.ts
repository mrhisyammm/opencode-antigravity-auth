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

// Frontend HTML page serving a rich, responsive dashboard UI
function getFrontendHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Antigravity Monitor & Quota Dashboard</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  <style>
    body { background-color: #0f172a; color: #f1f5f9; }
    .card { background-color: #1e293b; border: 1px solid #334155; }
    .progress-bar-bg { background-color: #334155; }
    .scrollbar-thin::-webkit-scrollbar { width: 6px; height: 6px; }
    .scrollbar-thin::-webkit-scrollbar-track { background: #1e293b; }
    .scrollbar-thin::-webkit-scrollbar-thumb { background: #475569; border-radius: 3px; }
  </style>
</head>
<body class="min-h-screen flex flex-col font-sans">
  <!-- Top Navbar -->
  <header class="bg-slate-900 border-b border-slate-800 px-6 py-4 flex items-center justify-between shadow-md">
    <div class="flex items-center space-x-3">
      <div class="bg-blue-600 text-white p-2 rounded-lg text-lg flex items-center justify-center shadow-lg">
        <i class="fa-solid fa-gauge-high"></i>
      </div>
      <div>
        <h1 class="text-xl font-bold tracking-tight text-white flex items-center">
          Antigravity Monitor <span class="ml-2 text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded border border-blue-500/30">Dashboard</span>
        </h1>
        <p class="text-xs text-slate-400">Real-time traffic inspector and token usage statistics</p>
      </div>
    </div>
    <div class="flex items-center space-x-3">
      <button onclick="clearAllLogs()" class="px-4 py-2 bg-rose-600/10 hover:bg-rose-600 text-rose-400 hover:text-white rounded-lg border border-rose-500/20 hover:border-rose-500 text-sm font-medium transition duration-200">
        <i class="fa-solid fa-trash-can mr-2"></i>Clear Logs
      </button>
      <button onclick="refreshData(true)" class="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 text-sm font-medium transition duration-200 flex items-center">
        <i id="refresh-icon" class="fa-solid fa-arrows-rotate mr-2"></i>Refresh
      </button>
    </div>
  </header>

  <main class="flex-1 p-6 max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-3 gap-6">
    <!-- Left Column: Metrics & Charts (Spans 1/3) -->
    <div class="lg:col-span-1 flex flex-col space-y-6">
      <!-- Quick Stats Grid -->
      <div class="grid grid-cols-2 gap-4">
        <div class="card p-4 rounded-xl flex flex-col justify-between">
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs text-slate-400 font-medium">Total Requests</span>
            <span class="text-blue-400 bg-blue-500/10 p-1.5 rounded-lg text-xs"><i class="fa-solid fa-paper-plane"></i></span>
          </div>
          <div>
            <h2 id="stat-requests" class="text-2xl font-bold text-white">0</h2>
            <p id="stat-success-rate" class="text-[10px] text-emerald-400 font-semibold mt-1">0% success rate</p>
          </div>
        </div>

        <div class="card p-4 rounded-xl flex flex-col justify-between">
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs text-slate-400 font-medium">Total Tokens</span>
            <span class="text-purple-400 bg-purple-500/10 p-1.5 rounded-lg text-xs"><i class="fa-solid fa-brain"></i></span>
          </div>
          <div>
            <h2 id="stat-tokens" class="text-2xl font-bold text-white">0</h2>
            <p id="stat-tokens-breakdown" class="text-[10px] text-slate-400 mt-1">0 in / 0 out</p>
          </div>
        </div>

        <div class="card p-4 rounded-xl flex flex-col justify-between">
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs text-slate-400 font-medium">Avg Latency</span>
            <span class="text-amber-400 bg-amber-500/10 p-1.5 rounded-lg text-xs"><i class="fa-solid fa-stopwatch"></i></span>
          </div>
          <div>
            <h2 id="stat-latency" class="text-2xl font-bold text-white">0ms</h2>
            <p class="text-[10px] text-slate-400 mt-1">average response time</p>
          </div>
        </div>

        <div class="card p-4 rounded-xl flex flex-col justify-between">
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs text-slate-400 font-medium">Active Accounts</span>
            <span class="text-teal-400 bg-teal-500/10 p-1.5 rounded-lg text-xs"><i class="fa-solid fa-user-group"></i></span>
          </div>
          <div>
            <h2 id="stat-accounts" class="text-2xl font-bold text-white">0</h2>
            <p id="stat-accounts-detail" class="text-[10px] text-slate-400 mt-1">0 enabled pool</p>
          </div>
        </div>
      </div>

      <!-- Token Chart -->
      <div class="card p-5 rounded-xl flex flex-col">
        <h3 class="text-sm font-semibold text-white mb-4 flex items-center">
          <i class="fa-solid fa-chart-pie mr-2 text-blue-500"></i>Tokens consumed by model
        </h3>
        <div class="relative flex-1 flex items-center justify-center min-h-[220px]">
          <canvas id="tokenChart" class="max-w-[200px] max-h-[200px]"></canvas>
          <div id="chart-no-data" class="absolute inset-0 flex items-center justify-center text-xs text-slate-400">No data available</div>
        </div>
      </div>
    </div>

    <!-- Middle/Right Column: Accounts Quota & Live Traffic (Spans 2/3) -->
    <div class="lg:col-span-2 flex flex-col space-y-6">
      <!-- Accounts Quota Status -->
      <div class="card p-5 rounded-xl">
        <h3 class="text-sm font-semibold text-white mb-4 flex items-center">
          <i class="fa-solid fa-id-card mr-2 text-teal-400"></i>Accounts Quota Status
        </h3>
        <div id="accounts-container" class="space-y-4 max-h-[260px] overflow-y-auto scrollbar-thin pr-1">
          <div class="text-center text-xs text-slate-400 py-6">No account information retrieved yet.</div>
        </div>
      </div>

      <!-- Live Traffic Logs -->
      <div class="card p-5 rounded-xl flex-1 flex flex-col">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-sm font-semibold text-white flex items-center">
            <i class="fa-solid fa-list-check mr-2 text-blue-400"></i>Live Traffic Monitor
          </h3>
          <span class="text-xs text-slate-400 font-medium">auto-refreshes every 3s</span>
        </div>
        <div class="flex-1 overflow-x-auto scrollbar-thin">
          <table class="w-full text-left border-collapse text-xs">
            <thead>
              <tr class="border-b border-slate-800 text-slate-400 font-medium">
                <th class="py-2.5 px-3">Status</th>
                <th class="py-2.5 px-3">Model</th>
                <th class="py-2.5 px-3">Account</th>
                <th class="py-2.5 px-3 text-right">Tokens</th>
                <th class="py-2.5 px-3 text-right">Latency</th>
                <th class="py-2.5 px-3 text-right">Time</th>
              </tr>
            </thead>
            <tbody id="logs-tbody" class="divide-y divide-slate-800/50">
              <tr>
                <td colspan="6" class="py-12 text-center text-slate-400">No requests captured yet. Waiting for traffic...</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </main>

  <!-- Log Details Modal -->
  <div id="details-modal" class="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 hidden flex items-center justify-center p-4">
    <div class="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-lg overflow-hidden shadow-2xl">
      <div class="px-5 py-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
        <h4 class="font-bold text-white text-sm flex items-center">
          <i class="fa-solid fa-circle-info mr-2 text-blue-500"></i>Request Details
        </h4>
        <button onclick="closeModal()" class="text-slate-400 hover:text-white transition duration-200">
          <i class="fa-solid fa-xmark text-lg"></i>
        </button>
      </div>
      <div id="modal-content" class="p-5 space-y-4 text-xs text-slate-300">
        <!-- Content injected dynamically -->
      </div>
      <div class="px-5 py-3 border-t border-slate-800 flex justify-end bg-slate-900/30">
        <button onclick="closeModal()" class="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-semibold transition">Close</button>
      </div>
    </div>
  </div>

  <footer class="bg-slate-950 border-t border-slate-900 py-3 text-center text-[10px] text-slate-500">
    Antigravity auth plugin v1.1.0 • Running locally in the background
  </footer>

  <script>
    let tokenChart = null;

    // Helper to format timestamps to hh:mm:ss
    function formatTime(timestamp) {
      const date = new Date(timestamp);
      return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    }

    // Helper to calculate time until reset
    function formatResetTime(resetTime) {
      if (!resetTime) return 'N/A';
      const ms = Date.parse(resetTime) - Date.now();
      if (ms <= 0) return 'resetting...';
      const hours = ms / (1000 * 60 * 60);
      if (hours >= 24) {
        const days = Math.floor(hours / 24);
        const remHours = Math.floor(hours % 24);
        return remHours > 0 ? \`\${days}d \${remHours}h\` : \`\${days}d\`;
      }
      const mins = Math.ceil(ms / 60000);
      if (mins >= 60) {
        return \`\${Math.floor(mins / 60)}h \${mins % 60}m\`;
      }
      return \`\${mins}m\`;
    }

    // Format number to compact units e.g. 1.2K
    function formatNumber(num) {
      if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
      if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
      return num.toString();
    }

    // Fetch and populate data
    async function refreshData(isManual = false) {
      const icon = document.getElementById('refresh-icon');
      if (isManual && icon) icon.classList.add('fa-spin');

      try {
        const [statsRes, logsRes, accountsRes] = await Promise.all([
          fetch('/api/stats').then(r => r.json()),
          fetch('/api/logs').then(r => r.json()),
          fetch('/api/accounts').then(r => r.json())
        ]);

        updateStatsCard(statsRes);
        updateLogsTable(logsRes);
        updateAccountsSection(accountsRes);
        updateChart(statsRes);

      } catch (err) {
        console.error("Dashboard failed to refresh:", err);
      } finally {
        if (isManual && icon) {
          setTimeout(() => icon.classList.remove('fa-spin'), 600);
        }
      }
    }

    function updateStatsCard(stats) {
      document.getElementById('stat-requests').innerText = stats.totalRequests;
      
      const successRate = stats.totalRequests > 0 
        ? Math.round((stats.successRequests / stats.totalRequests) * 100) 
        : 100;
      const rateEl = document.getElementById('stat-success-rate');
      rateEl.innerText = \`\${successRate}% success rate\`;
      rateEl.className = successRate >= 90 ? "text-[10px] text-emerald-400 font-semibold mt-1" : "text-[10px] text-amber-400 font-semibold mt-1";

      document.getElementById('stat-tokens').innerText = formatNumber(stats.totalTokens);
      document.getElementById('stat-tokens-breakdown').innerText = \`\${formatNumber(stats.totalInputTokens)} in / \${formatNumber(stats.totalOutputTokens)} out\`;
      
      document.getElementById('stat-latency').innerText = \`\${stats.averageLatencyMs}ms\`;
    }

    function updateLogsTable(logs) {
      const tbody = document.getElementById('logs-tbody');
      if (logs.length === 0) {
        tbody.innerHTML = \`<tr><td colspan="6" class="py-12 text-center text-slate-400">No requests captured yet. Waiting for traffic...</td></tr>\`;
        return;
      }

      tbody.innerHTML = logs.map(log => {
        const isSuccess = log.statusCode >= 200 && log.statusCode < 300;
        const statusClass = isSuccess 
          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" 
          : "bg-rose-500/10 text-rose-400 border border-rose-500/20";
        const shortEmail = log.accountEmail.split('@')[0] || log.accountEmail;
        const formattedTokens = formatNumber(log.tokens.total);

        return \`<tr onclick="showLogDetails('\${log.id}')" class="border-b border-slate-800/40 hover:bg-slate-800/30 transition duration-150 cursor-pointer">
          <td class="py-2.5 px-3"><span class="px-2 py-0.5 rounded text-[10px] font-semibold \${statusClass}">\${log.statusCode}</span></td>
          <td class="py-2.5 px-3 font-semibold text-slate-200 font-mono text-[10px] truncate max-w-[150px]">\${log.modelName}</td>
          <td class="py-2.5 px-3 text-slate-300 font-medium">\${shortEmail}</td>
          <td class="py-2.5 px-3 text-right text-slate-300 font-semibold">\${formattedTokens}</td>
          <td class="py-2.5 px-3 text-right text-slate-300">\${log.latencyMs}ms</td>
          <td class="py-2.5 px-3 text-right text-slate-400 font-medium">\${formatTime(log.timestamp)}</td>
        </tr>\`;
      }).join('');
    }

    function updateAccountsSection(accounts) {
      document.getElementById('stat-accounts').innerText = accounts.length;
      const enabledCount = accounts.filter(a => a.enabled).length;
      document.getElementById('stat-accounts-detail').innerText = \`\${enabledCount} enabled pool\`;

      const container = document.getElementById('accounts-container');
      if (accounts.length === 0) {
        container.innerHTML = \`<div class="text-center text-xs text-slate-400 py-6">No account information retrieved yet.</div>\`;
        return;
      }

      container.innerHTML = accounts.map(acc => {
        const isCooling = acc.coolingDownUntil && acc.coolingDownUntil > Date.now();
        const statusBadge = isCooling
          ? \`<span class="bg-amber-500/10 text-amber-400 px-1.5 py-0.5 rounded border border-amber-500/20 text-[9px] font-semibold"><i class="fa-solid fa-snowflake mr-1"></i>Cooling Down</span>\`
          : acc.enabled
            ? \`<span class="bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-500/20 text-[9px] font-semibold"><i class="fa-solid fa-circle-check mr-1"></i>Active</span>\`
            : \`<span class="bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded border border-slate-700 text-[9px] font-semibold">Disabled</span>\`;

        // Generate quota group HTML
        let quotaGroupsHtml = '';
        if (acc.cachedQuota) {
          const quotaEntries = [
            { name: "Claude 5-Hour Limit", key: "claude-nonweekly" },
            { name: "Claude Weekly Limit", key: "claude-weekly" },
            { name: "Gemini 5-Hour Limit", key: "gemini-nonweekly" },
            { name: "Gemini Weekly Limit", key: "gemini-weekly" }
          ];

          quotaGroupsHtml = \`<div class="grid grid-cols-2 gap-3 mt-3 pt-2.5 border-t border-slate-800/40">\`;
          quotaEntries.forEach(entry => {
            const q = acc.cachedQuota[entry.key];
            if (!q) {
              quotaGroupsHtml += \`<div>
                <span class="text-[9px] text-slate-500 font-medium">\${entry.name}</span>
                <div class="text-[10px] text-slate-400 italic mt-0.5">N/A (does not apply)</div>
              </div>\`;
            } else {
              const remPct = Math.round((q.remainingFraction ?? 0) * 100);
              const colorClass = remPct < 20 ? "bg-rose-500" : remPct < 60 ? "bg-amber-500" : "bg-emerald-500";
              const textClass = remPct < 20 ? "text-rose-400" : remPct < 60 ? "text-amber-400" : "text-emerald-400";
              const resetText = q.resetTime ? \`resets: \${formatResetTime(q.resetTime)}\` : 'N/A';
              
              quotaGroupsHtml += \`<div>
                <div class="flex justify-between items-center text-[9px] font-medium text-slate-400 mb-1">
                  <span>\${entry.name}</span>
                  <span class="\${textClass}">\${remPct}%</span>
                </div>
                <div class="progress-bar-bg w-full rounded-full h-1 overflow-hidden">
                  <div class="\${colorClass} h-full" style="width: \${remPct}%"></div>
                </div>
                <div class="text-[8px] text-slate-500 mt-1">\${resetText}</div>
              </div>\`;
            }
          });
          quotaGroupsHtml += \`</div>\`;
        } else {
          quotaGroupsHtml = \`<div class="text-[10px] text-slate-500 italic mt-2.5">No quota data cached yet. Make a request or trigger "Check quotas" to fetch.</div>\`;
        }

        return \`<div class="bg-slate-900/40 border border-slate-800/60 rounded-xl p-3.5 shadow-sm">
          <div class="flex items-center justify-between">
            <span class="text-xs font-semibold text-white flex items-center">
              <i class="fa-solid fa-envelope mr-1.5 text-slate-400"></i>\${acc.email}
            </span>
            \${statusBadge}
          </div>
          \${quotaGroupsHtml}
        </div>\`;
      }).join('');
    }

    function updateChart(stats) {
      const ctx = document.getElementById('tokenChart');
      const chartNoData = document.getElementById('chart-no-data');
      
      const models = Object.keys(stats.statsByModel);
      if (models.length === 0) {
        if (ctx) ctx.classList.add('hidden');
        if (chartNoData) chartNoData.classList.remove('hidden');
        return;
      }

      if (ctx) ctx.classList.remove('hidden');
      if (chartNoData) chartNoData.classList.add('hidden');

      const data = models.map(m => stats.statsByModel[m].totalTokens);
      const labels = models.map(m => m.replace('antigravity-', ''));
      const bgColors = [
        'rgba(59, 130, 246, 0.7)',  // blue
        'rgba(168, 85, 247, 0.7)',  // purple
        'rgba(249, 115, 22, 0.7)',  // orange
        'rgba(20, 184, 166, 0.7)',  // teal
        'rgba(239, 68, 68, 0.7)',   // red
        'rgba(234, 179, 8, 0.7)',   // yellow
      ];

      if (tokenChart) {
        tokenChart.data.labels = labels;
        tokenChart.data.datasets[0].data = data;
        tokenChart.update();
      } else {
        tokenChart = new Chart(ctx, {
          type: 'doughnut',
          data: {
            labels: labels,
            datasets: [{
              data: data,
              backgroundColor: bgColors.slice(0, models.length),
              borderWidth: 1.5,
              borderColor: '#1e293b'
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                position: 'bottom',
                labels: {
                  boxWidth: 8,
                  padding: 8,
                  font: { size: 9 },
                  color: '#94a3b8'
                }
              }
            },
            cutout: '65%'
          }
        });
      }
    }

    async function showLogDetails(logId) {
      const modal = document.getElementById('details-modal');
      const content = document.getElementById('modal-content');
      modal.classList.remove('hidden');
      content.innerHTML = \`<div class="flex items-center justify-center py-6 text-slate-400"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Loading details...</div>\`;

      try {
        const logs = await fetch('/api/logs').then(r => r.json());
        const log = logs.find(l => l.id === logId);
        
        if (!log) {
          content.innerHTML = \`<div class="text-rose-400">Log transaction not found.</div>\`;
          return;
        }

        const isSuccess = log.statusCode >= 200 && log.statusCode < 300;
        const statusBadge = isSuccess
          ? \`<span class="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded text-[10px] font-bold">SUCCESS (\${log.statusCode})</span>\`
          : \`<span class="bg-rose-500/10 text-rose-400 border border-rose-500/20 px-2 py-0.5 rounded text-[10px] font-bold">FAILED (\${log.statusCode})</span>\`;

        content.innerHTML = \`
          <div class="grid grid-cols-3 gap-2 bg-slate-950/40 p-3 rounded-lg border border-slate-800">
            <div class="text-slate-400 font-medium">Request Status:</div>
            <div class="col-span-2 font-semibold">\${statusBadge}</div>
            
            <div class="text-slate-400 font-medium">Model ID:</div>
            <div class="col-span-2 font-mono font-semibold text-slate-200">\${log.modelName}</div>

            <div class="text-slate-400 font-medium">Requested Model:</div>
            <div class="col-span-2 font-mono font-medium text-slate-300">\${log.requestedModel}</div>
            
            <div class="text-slate-400 font-medium">User Account:</div>
            <div class="col-span-2 font-semibold text-slate-300">\${log.accountEmail}</div>
            
            <div class="text-slate-400 font-medium">Execution Latency:</div>
            <div class="col-span-2 font-semibold text-amber-400">\${log.latencyMs}ms</div>

            <div class="text-slate-400 font-medium">Timestamp:</div>
            <div class="col-span-2 text-slate-400">\${new Date(log.timestamp).toLocaleString()}</div>
          </div>

          <div class="bg-slate-950/20 p-3 rounded-lg border border-slate-800/80">
            <h5 class="font-bold text-white mb-2 flex items-center"><i class="fa-solid fa-ticket mr-1.5 text-purple-400"></i>Token Accounting</h5>
            <div class="grid grid-cols-2 gap-y-2">
              <div class="text-slate-400 font-medium flex justify-between pr-4"><span>Prompt Input:</span> <span>\${formatNumber(log.tokens.input)}</span></div>
              <div class="text-slate-400 font-medium flex justify-between pl-4 border-l border-slate-800"><span>Candidates Output:</span> <span>\${formatNumber(log.tokens.output)}</span></div>
              <div class="text-slate-400 font-medium flex justify-between pr-4 mt-1 border-t border-slate-800/50 pt-1"><span>Thinking (Cached):</span> <span>\${log.tokens.thinking ? formatNumber(log.tokens.thinking) : '0'}</span></div>
              <div class="text-white font-bold flex justify-between pl-4 border-l border-slate-800 mt-1 border-t border-slate-800/50 pt-1"><span>Total Consumption:</span> <span class="text-purple-400">\${formatNumber(log.tokens.total)}</span></div>
            </div>
          </div>

          \${!isSuccess && log.error ? \`
            <div class="bg-rose-950/20 border border-rose-950 text-rose-300 p-3 rounded-lg">
              <h5 class="font-bold text-white mb-1 flex items-center"><i class="fa-solid fa-triangle-exclamation mr-1.5"></i>Error Message</h5>
              <p class="font-mono text-[10px] whitespace-pre-wrap select-text">\${log.error}</p>
            </div>
          \` : ''}
        \`;
      } catch (err) {
        content.innerHTML = \`<div class="text-rose-400">Failed to fetch log details: \${err.message}</div>\`;
      }
    }

    function closeModal() {
      document.getElementById('details-modal').classList.add('hidden');
    }

    async function clearAllLogs() {
      if (confirm("Are you sure you want to delete all traffic logs and reset stats?")) {
        try {
          const res = await fetch('/api/logs', { method: 'DELETE' });
          if (res.ok) {
            refreshData();
          }
        } catch (e) {
          console.error("Failed to clear logs:", e);
        }
      }
    }

    // Auto Refresh Polling (Every 3 seconds)
    setInterval(() => refreshData(false), 3000);

    // Initial Fetch
    refreshData(false);
  </script>
</body>
</html>`;
}
