/**
 * Structured JSON logger. Never log secrets, tokens, document contents or
 * full AI responses. Pass identifiers (ids) and error codes instead.
 */
type Level = "debug" | "info" | "warn" | "error";
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const SENSITIVE_KEYS =
  /pass(word)?|secret|token|key|authorization|cookie|raw_?response|content|iban/i;

function currentLevel(): Level {
  const value = process.env.LOG_LEVEL;
  return value === "debug" || value === "warn" || value === "error" ? value : "info";
}

function redact(value: unknown, depth = 0): unknown {
  if (depth > 4 || value == null) return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redact(v, depth + 1));
  if (value instanceof Error) return { name: value.name, message: value.message.slice(0, 500) };
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEYS.test(k) ? "[redacted]" : redact(v, depth + 1);
    }
    return out;
  }
  if (typeof value === "string" && value.length > 1000) return `${value.slice(0, 1000)}…`;
  return value;
}

function write(level: Level, msg: string, fields?: Record<string, unknown>) {
  if (ORDER[level] < ORDER[currentLevel()]) return;
  const entry = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    msg,
    ...(fields ? (redact(fields) as Record<string, unknown>) : {}),
  });
  if (level === "error") console.error(entry);
  else if (level === "warn") console.warn(entry);
  else console.log(entry);
}

export const logger = {
  debug: (msg: string, fields?: Record<string, unknown>) => write("debug", msg, fields),
  info: (msg: string, fields?: Record<string, unknown>) => write("info", msg, fields),
  warn: (msg: string, fields?: Record<string, unknown>) => write("warn", msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) => write("error", msg, fields),
};

export { redact as redactForLogging };
