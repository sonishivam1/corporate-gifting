import rateLimit from "@fastify/rate-limit";
import type { CatalogConnector } from "@gifting/commerce";
import type { OrderPlacer } from "@gifting/domain";
import { createLogger, type Logger } from "@gifting/logger";
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from "fastify";
import { ZodError } from "zod";

import { type AppDeps, defaultDeps } from "./deps";
import { ApiError, errorBody } from "./http/errors";
import { registerRoutes } from "./http/route";
import { registerSession } from "./http/session";
import type { AccountsService } from "./modules/accounts/service";
import { buildModules } from "./modules/index";
import { health, meta } from "./system-routes";

/**
 * - `accounts` registers people and checks who is calling (ADR 0015).
 *   Without it, the sign-in routes and every signed-in route answer 503
 *   `auth_not_configured`, so the API still starts (and `/health` works)
 *   before a commerce connector is configured.
 * - `deps` is what the dashboard's "workspace" routes run against
 *   (database, demo company, development session); integration tests pass a
 *   throwaway database.
 */
export async function buildApp(
  options: {
    logger?: Logger;
    deps?: AppDeps;
    accounts?: AccountsService | null;
    catalog?: CatalogConnector | null;
    orders?: OrderPlacer;
  } = {},
): Promise<FastifyInstance> {
  const log = options.logger ?? createLogger("api");
  const app = Fastify({
    // pino is what Fastify uses underneath; widen to its base logger type.
    loggerInstance: log as FastifyBaseLogger,
    // Fastify's own request log prints the raw URL, and gift link tokens travel in the path.
    // We log the route pattern instead (see the onResponse hook below).
    disableRequestLogging: true,
    genReqId: () => crypto.randomUUID(),
    // Behind Cloud Run's proxy the client address is in X-Forwarded-For; rate limits need the real one.
    trustProxy: true,
  });

  await app.register(rateLimit, {
    global: false,
    errorResponseBuilder: () => ({ statusCode: 429, error: "Too Many Requests", message: "Too many requests." }),
  });

  app.addHook("onResponse", async (request, reply) => {
    request.log.info(
      { method: request.method, route: request.routeOptions.url ?? "unmatched", status: reply.statusCode, ms: Math.round(reply.elapsedTime) },
      "request completed",
    );
  });
  app.decorate("accounts", options.accounts ?? null);

  app.setErrorHandler((err, request, reply) => {
    if (err instanceof ApiError) {
      return reply.status(err.status).send(errorBody(err.code, err.message));
    }
    if ((err as { statusCode?: number }).statusCode === 429) {
      return reply.status(429).send(errorBody("rate_limited", "Too many requests. Please wait a moment and try again."));
    }
    if (err instanceof ZodError) {
      return reply.status(400).send(errorBody("invalid_request", "The request is not valid."));
    }
    // The database is down or unreachable: say so, instead of a generic 500.
    if (/^Mongo(ServerSelection|Network|NotConnected|Topology)/.test((err as Error).name ?? "")) {
      request.log.warn({ errName: (err as Error).name }, "database unavailable");
      return reply.status(503).send(errorBody("database_unavailable", "The database isn't reachable. Start it with pnpm db:up."));
    }
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status >= 400 && status < 500) {
      return reply.status(status).send(errorBody("bad_request", "The request could not be read."));
    }
    // An order error carries a safe, specific message (codes only, no personal data): keep it, so a refused order can be diagnosed.
    const detail = err instanceof Error && err.name === "OrderError" ? { orderError: { code: (err as { code?: string }).code, message: err.message } } : {};
    request.log.error({ err, ...detail }, "unhandled error");
    return reply.status(500).send(errorBody("internal_error", "Something went wrong."));
  });

  app.setNotFoundHandler((_request, reply) => reply.status(404).send(errorBody("not_found", "Not found.")));

  const deps = options.deps ?? defaultDeps(process.env, { log, catalog: options.catalog });
  // The commerce connector creates gift orders. Assigned, not spread: the default deps open the database lazily.
  if (options.orders && !deps.orders) deps.orders = options.orders;
  const modules = buildModules(deps);
  registerSession(app, deps);
  registerRoutes(app, [health, meta(modules), ...modules.flatMap((m) => m.routes)]);
  return app;
}
