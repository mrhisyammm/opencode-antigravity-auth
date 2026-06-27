import { promises as fs } from "node:fs";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { randomBytes } from "node:crypto";
import lockfile from "proper-lockfile";
import { getConfigDir } from "../storage.js";
import { createLogger } from "../logger.js";

const log = createLogger("dashboard-store");

export interface TrafficLog {
  id: string;
  timestamp: number;
  accountEmail: string;
  modelName: string;
  requestedModel: string;
  tokens: {
    input: number;
    output: number;
    total: number;
    thinking?: number;
  };
  latencyMs: number;
  statusCode: number;
  error?: string;
}

export interface TrafficStats {
  totalRequests: number;
  successRequests: number;
  failedRequests: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalThinkingTokens: number;
  averageLatencyMs: number;
  statsByModel: Record<string, {
    requests: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    thinkingTokens: number;
    averageLatencyMs: number;
  }>;
  statsByAccount: Record<string, {
    requests: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    thinkingTokens: number;
  }>;
}

const MAX_LOGS = 10000;

export interface LogFilter {
  model?: string;
  account?: string;
  dateFrom?: number;
  dateTo?: number;
  status?: "success" | "failed";
}

function getLogFilePath(): string {
  return join(getConfigDir(), "antigravity-dashboard-logs.json");
}

function applyFilter(logs: TrafficLog[], filter: LogFilter): TrafficLog[] {
  return logs.filter(l => {
    if (filter.model && l.modelName !== filter.model) return false;
    if (filter.account && l.accountEmail !== filter.account) return false;
    if (filter.dateFrom && l.timestamp < filter.dateFrom) return false;
    if (filter.dateTo && l.timestamp > filter.dateTo) return false;
    if (filter.status === "success" && !(l.statusCode >= 200 && l.statusCode < 300)) return false;
    if (filter.status === "failed" && l.statusCode >= 200 && l.statusCode < 300) return false;
    return true;
  });
}

async function withFileLock<T>(path: string, fn: () => Promise<T>): Promise<T> {
  const configDir = dirname(path);
  await fs.mkdir(configDir, { recursive: true });

  if (!existsSync(path)) {
    await fs.writeFile(path, JSON.stringify([], null, 2), "utf-8");
  }
  
  let release: (() => Promise<void>) | null = null;
  try {
    release = await lockfile.lock(path, { retries: 5, realpath: false });
    return await fn();
  } finally {
    if (release) {
      await release();
    }
  }
}

export async function saveLog(trafficLog: Omit<TrafficLog, "id" | "timestamp">): Promise<TrafficLog> {
  const path = getLogFilePath();
  const fullLog: TrafficLog = {
    ...trafficLog,
    id: randomBytes(8).toString("hex"),
    timestamp: Date.now(),
  };

  try {
    await withFileLock(path, async () => {
      let logs: TrafficLog[] = [];
      try {
        const content = await fs.readFile(path, "utf-8");
        logs = JSON.parse(content);
      } catch (e) {
        // Fallback to empty list if reading fails
      }

      logs.push(fullLog);
      if (logs.length > MAX_LOGS) {
        logs = logs.slice(logs.length - MAX_LOGS);
      }

      const tempPath = `${path}.${randomBytes(6).toString("hex")}.tmp`;
      await fs.writeFile(tempPath, JSON.stringify(logs, null, 2), "utf-8");
      await fs.rename(tempPath, path);
    });
  } catch (error) {
    log.error("Failed to save traffic log", { error: String(error) });
  }

  return fullLog;
}

async function readAllLogs(): Promise<TrafficLog[]> {
  const path = getLogFilePath();
  if (!existsSync(path)) {
    return [];
  }
  try {
    const content = await fs.readFile(path, "utf-8");
    return JSON.parse(content) as TrafficLog[];
  } catch (error) {
    log.error("Failed to read traffic logs", { error: String(error) });
    return [];
  }
}

export async function getLogs(limit = 100, filter?: LogFilter): Promise<TrafficLog[]> {
  let logs = await readAllLogs();
  if (filter) {
    logs = applyFilter(logs, filter);
  }
  return logs.slice(-limit).reverse(); // Return newest first
}

export async function getStats(filter?: LogFilter): Promise<TrafficStats> {
  let allLogs = await readAllLogs();
  if (filter) {
    allLogs = applyFilter(allLogs, filter);
  }

  const stats: TrafficStats = {
    totalRequests: allLogs.length,
    successRequests: 0,
    failedRequests: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalTokens: 0,
    totalThinkingTokens: 0,
    averageLatencyMs: 0,
    statsByModel: {},
    statsByAccount: {},
  };

  if (allLogs.length === 0) {
    return stats;
  }

  let totalLatency = 0;

  for (const logItem of allLogs) {
    const isSuccess = logItem.statusCode >= 200 && logItem.statusCode < 300;
    if (isSuccess) stats.successRequests++;
    else stats.failedRequests++;

    const input = logItem.tokens.input || 0;
    const output = logItem.tokens.output || 0;
    const total = logItem.tokens.total || 0;
    const thinking = logItem.tokens.thinking || 0;

    stats.totalInputTokens += input;
    stats.totalOutputTokens += output;
    stats.totalTokens += total;
    stats.totalThinkingTokens += thinking;
    totalLatency += logItem.latencyMs;

    // Model Stats
    const m = logItem.modelName || "unknown";
    if (!stats.statsByModel[m]) {
      stats.statsByModel[m] = {
        requests: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        thinkingTokens: 0,
        averageLatencyMs: 0,
      };
    }
    const modelStat = stats.statsByModel[m]!;
    modelStat.requests++;
    modelStat.inputTokens += input;
    modelStat.outputTokens += output;
    modelStat.totalTokens += total;
    modelStat.thinkingTokens += thinking;
    modelStat.averageLatencyMs += logItem.latencyMs;

    // Account Stats
    const acc = logItem.accountEmail || "unknown";
    if (!stats.statsByAccount[acc]) {
      stats.statsByAccount[acc] = {
        requests: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        thinkingTokens: 0,
      };
    }
    const accStat = stats.statsByAccount[acc]!;
    accStat.requests++;
    accStat.inputTokens += input;
    accStat.outputTokens += output;
    accStat.totalTokens += total;
    accStat.thinkingTokens += thinking;
  }

  stats.averageLatencyMs = Math.round(totalLatency / allLogs.length);

  // Compute averages for models
  for (const key of Object.keys(stats.statsByModel)) {
    const modelStat = stats.statsByModel[key]!;
    modelStat.averageLatencyMs = Math.round(modelStat.averageLatencyMs / modelStat.requests);
  }

  return stats;
}

export interface AvailableFilters {
  models: string[];
  accounts: string[];
  dateRange: { earliest: number; latest: number } | null;
}

export async function getAvailableFilters(): Promise<AvailableFilters> {
  const logs = await readAllLogs();
  const models = new Set<string>();
  const accounts = new Set<string>();
  let earliest = Infinity;
  let latest = -Infinity;

  for (const l of logs) {
    if (l.modelName) models.add(l.modelName);
    if (l.accountEmail) accounts.add(l.accountEmail);
    if (l.timestamp < earliest) earliest = l.timestamp;
    if (l.timestamp > latest) latest = l.timestamp;
  }

  return {
    models: [...models].sort(),
    accounts: [...accounts].sort(),
    dateRange: logs.length > 0 ? { earliest, latest } : null,
  };
}

export async function clearLogs(): Promise<void> {
  const path = getLogFilePath();
  try {
    if (existsSync(path)) {
      await fs.unlink(path);
    }
  } catch (error) {
    log.error("Failed to clear traffic logs", { error: String(error) });
  }
}
