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
export async function buildApp(options: { logger?: Logger; deps?: AppDeps; accounts?: AccountsService | null } = {}): Promise<FastifyInstance> {
  const log = options.logger ?? createLogger("api");
  const app = Fastify({
    // pino is what Fastify uses underneath; widen to its base logger type.
    loggerInstance: log as FastifyBaseLogger,
    disableRequestLogging: false,
    genReqId: () => crypto.randomUUID(),
  });
  app.decorate("accounts", options.accounts ?? null);

  app.setErrorHandler((err, request, reply) => {
    if (err instanceof ApiError) {
      return reply.status(err.status).send(errorBody(err.code, err.message));
    }
    if (err instanceof ZodError) {
      return reply.status(400).send(errorBody("invalid_request", "The request is not valid."));
    }
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status >= 400 && status < 500) {
      return reply.status(status).send(errorBody("bad_request", "The request could not be read."));
    }
    request.log.error({ err }, "unhandled error");
    return reply.status(500).send(errorBody("internal_error", "Something went wrong."));
  });

  app.setNotFoundHandler((_request, reply) => reply.status(404).send(errorBody("not_found", "Not found.")));

  const deps = options.deps ?? defaultDeps();
  const modules = buildModules(deps);
  registerSession(app, deps);
  registerRoutes(app, [health, meta(modules), ...modules.flatMap((m) => m.routes)]);
  return app;
}
