import type { AccountView } from "@gifting/domain";
import type { FastifyInstance, FastifyReply, FastifyRequest, HTTPMethods } from "fastify";
import type { z } from "zod";

import type { AccountsService } from "../modules/accounts/service";
import { ApiError } from "./errors";

/**
 * Every route is defined here: Zod schemas for params, query, body and
 * response (ADR 0010). Input that fails its schema is a 400; the response is
 * parsed too, so fields the schema doesn't list never leave the API.
 *
 * Every route also says who may call it (ADR 0015):
 * - "account" (the default): a signed-in person with a verified email. The
 *   handler gets `account`, taken from the access token, never from the request;
 * - "ops": platform operators. Anyone else gets 404, so the route's
 *   existence doesn't leak;
 * - "public": no sign-in (health, meta, register and sign-in themselves);
 * - "workspace": the dashboard's company and team scope, from the
 *   development session (http/session.ts) until the B2C workspace model is
 *   decided. Handlers call `requireSession(request)`. Refused unless
 *   DEV_AUTH=1 outside production.
 */
export type RouteSchema = {
  params?: z.ZodType;
  query?: z.ZodType;
  body?: z.ZodType;
  response?: z.ZodType;
};

export type RouteAuth = "account" | "ops" | "public" | "workspace";

type Infer<T> = T extends z.ZodType ? z.infer<T> : undefined;

export type RouteContext<S extends RouteSchema, A extends RouteAuth = "account"> = {
  params: Infer<S["params"]>;
  query: Infer<S["query"]>;
  body: Infer<S["body"]>;
  /** The signed-in person; undefined on public and workspace routes. */
  account: A extends "public" | "workspace" ? undefined : AccountView;
  request: FastifyRequest;
  reply: FastifyReply;
};

export type RateLimit = { max: number; timeWindow: string };

export type RouteDefinition<S extends RouteSchema = RouteSchema, A extends RouteAuth = RouteAuth> = {
  method: HTTPMethods;
  url: string;
  auth?: A;
  schema: S;
  /** Requests allowed per client address in the window. Routes that take a secret or create something should set one. */
  rateLimit?: RateLimit;
  handler: (ctx: RouteContext<S, A>) => Promise<Infer<S["response"]>>;
};

declare module "fastify" {
  interface FastifyContextConfig {
    /** The route is a "workspace" route: the development session hook scopes it. */
    workspace?: boolean;
  }
  interface FastifyInstance {
    /** Accounts and sign-in. Null until the sign-in client is configured. */
    accounts: AccountsService | null;
  }
}

export function defineRoute<S extends RouteSchema, A extends RouteAuth = "account">(definition: RouteDefinition<S, A>): RouteDefinition<S, A> {
  if (definition.url !== "/health" && !definition.url.startsWith("/v1/")) {
    throw new Error(`Route ${definition.url} must live under /v1 (only /health is unversioned).`);
  }
  return definition;
}

/** The token from an `Authorization: Bearer <token>` header, or null. */
export function bearerToken(header: string | undefined): string | null {
  const match = /^Bearer ([A-Za-z0-9._~+/:-]+=*)$/.exec(header ?? "");
  return match ? match[1]! : null;
}

const parse = (schema: z.ZodType | undefined, value: unknown) => (schema ? schema.parse(value) : undefined);

async function authenticate(request: FastifyRequest, auth: RouteAuth): Promise<AccountView | undefined> {
  if (auth === "public" || auth === "workspace") return undefined;
  const accounts = request.server.accounts;
  if (!accounts) throw new ApiError(503, "auth_not_configured", "Sign-in is not configured on this server.");
  const token = bearerToken(request.headers.authorization);
  if (!token) throw new ApiError(401, "unauthenticated", "Sign in to continue.");
  const account = await accounts.authenticate(token);
  if (auth === "ops" && !accounts.isOps(account)) throw new ApiError(404, "not_found", "Not found.");
  return account;
}

export function registerRoutes(app: FastifyInstance, routes: readonly RouteDefinition<RouteSchema, RouteAuth>[]): void {
  for (const route of routes) {
    app.route({
      method: route.method,
      url: route.url,
      config: { workspace: route.auth === "workspace", ...(route.rateLimit ? { rateLimit: route.rateLimit } : {}) },
      handler: async (request, reply) => {
        const account = await authenticate(request, route.auth ?? "account");
        const result = await route.handler({
          params: parse(route.schema.params, request.params),
          query: parse(route.schema.query, request.query),
          body: parse(route.schema.body, request.body),
          account,
          request,
          reply,
        } as RouteContext<RouteSchema, RouteAuth>);
        return route.schema.response ? route.schema.response.parse(result) : result;
      },
    });
  }
}
