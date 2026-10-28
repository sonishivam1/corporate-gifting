import pino, { type DestinationStream, type Level, type Logger as PinoLogger } from "pino";

/**
 * The platform's logger: structured JSON, with personal and secret fields
 * redacted. Use it instead of `console` in server code, workers and scripts:
 *
 *   const log = createLogger("gifts", { requestId, companyKey });
 *   log.info({ giftId, status: "redeemed" }, "gift redeemed");
 *
 * Never log recipient details, gift tokens or codes, keys or connection
 * strings on purpose; the redaction is a safety net, not a licence.
 */

export type Logger = PinoLogger;

export type LogContext = {
  requestId?: string;
  companyKey?: string;
  teamKey?: string;
  [key: string]: unknown;
};

export const MASK = "[redacted]";

/** Field names that never reach a log line, at the top level or one level down. */
export const REDACTED_FIELDS = [
  "name",
  "firstName",
  "lastName",
  "email",
  "phone",
  "address",
  "birthday",
  "birthdayMonthDay",
  "token",
  "shortCode",
  "password",
  "secret",
  "clientSecret",
  "apiKey",
  "authorization",
  "cookie",
  "connectionString",
  "uri",
] as const;

/** An error we raised ourselves: its message is safe to log. */
export class AppError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

/**
 * Provider and driver errors can echo request data, so only their type and
 * code are logged. (The field is `type`, not `name`, because `name` is
 * redacted as a personal field.)
 */
function serializeError(err: unknown) {
  if (err instanceof AppError) return { type: err.name, code: err.code, message: err.message, stack: err.stack };
  if (err instanceof Error) {
    const code = (err as { code?: unknown }).code;
    return { type: err.name, ...(typeof code === "string" || typeof code === "number" ? { code } : {}) };
  }
  return { type: typeof err };
}

const LEVELS: readonly string[] = ["trace", "debug", "info", "warn", "error", "fatal", "silent"];

function defaultLevel(): Level | "silent" {
  const env = process.env.LOG_LEVEL?.trim().toLowerCase();
  if (env && LEVELS.includes(env)) return env as Level | "silent";
  if (process.env.VITEST || process.env.NODE_ENV === "test") return "silent";
  return "info";
}

export function createLogger(
  area: string,
  context: LogContext = {},
  options: { level?: Level | "silent"; destination?: DestinationStream } = {},
): Logger {
  const root = pino(
    {
      level: options.level ?? defaultLevel(),
      base: { area },
      redact: {
        paths: REDACTED_FIELDS.flatMap((f) => [f, `*.${f}`]),
        censor: MASK,
      },
      serializers: { err: serializeError },
      timestamp: pino.stdTimeFunctions.isoTime,
    },
    options.destination,
  );
  return Object.keys(context).length > 0 ? root.child(context) : root;
}
