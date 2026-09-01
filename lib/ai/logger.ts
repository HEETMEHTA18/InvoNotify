type LogLevel = "debug" | "info" | "warn" | "error";

type LogEntry = {
  timestamp: string;
  level: LogLevel;
  module: string;
  message: string;
  [key: string]: unknown;
};

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const MIN_LEVEL: LogLevel =
  (process.env.LOG_LEVEL as LogLevel) || "info";

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[MIN_LEVEL];
}

function formatEntry(entry: LogEntry): string {
  if (process.env.NODE_ENV === "production") {
    return JSON.stringify(entry);
  }
  const ts = entry.timestamp.slice(11, 19);
  const mod = entry.module.padEnd(20);
  const extra = Object.keys(entry)
    .filter((k) => !["timestamp", "level", "module", "message"].includes(k))
    .map((k) => `${k}=${JSON.stringify((entry as Record<string, unknown>)[k])}`)
    .join(" ");
  return `${ts} ${entry.level.toUpperCase().padEnd(5)} [${mod}] ${entry.message}${extra ? " " + extra : ""}`;
}

function log(level: LogLevel, module: string, message: string, data?: Record<string, unknown>) {
  if (!shouldLog(level)) return;

  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    module,
    message,
    ...data,
  };

  const line = formatEntry(entry);
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export function createLogger(module: string) {
  return {
    debug: (message: string, data?: Record<string, unknown>) =>
      log("debug", module, message, data),
    info: (message: string, data?: Record<string, unknown>) =>
      log("info", module, message, data),
    warn: (message: string, data?: Record<string, unknown>) =>
      log("warn", module, message, data),
    error: (message: string, data?: Record<string, unknown>) =>
      log("error", module, message, data),
  };
}

export type Logger = ReturnType<typeof createLogger>;