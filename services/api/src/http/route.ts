import type { AccountView, Action } from "@gifting/domain";
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
 * - "member": the dashboard, inside one company and team (ADR 0016). The
 *   route names the `permission` (action) it needs; http/session.ts builds
 *   the session from the person's memberships and refuses the action when
 *   their roles don't grant it (403 forbidden). Handlers call
 *   `requireSession(request)`.
 */
export type RouteSchema = {
  params?: z.ZodType;
  query?: z.ZodType;
  body?: z.ZodType;
  response?: z.ZodType;
};

export type RouteAuth = "account" | "ops" | "public" | "member";

/** An action, or "member": anyone with a role on the team. */
export type RoutePermission = Action | "member";

type Infer<T> = T extends z.ZodType ? z.infer<T> : undefined;

export type RouteContext<S extends RouteSchema, A extends RouteAuth = "account"> = {
  params: Infer<S["params"]>;
  query: Infer<S["query"]>;
  body: Infer<S["body"]>;
  /** The signed-in person; undefined on public and member routes (member routes use the session). */
  account: A extends "public" | "member" ? undefined : AccountView;
  request: FastifyRequest;
  reply: FastifyReply;
};

export type RateLimit = { max: number; timeWindow: string };

export type RouteDefinition<S extends RouteSchema = RouteSchema, A extends RouteAuth = RouteAuth> = {
  method: HTTPMethods;
  url: string;
  auth?: A;
  /**
   * Member routes: the action the caller's roles must grant (`@gifting/domain`
   * permissions), or "member" for any member of the team. Required for them,
   * refused on others.
   */
  permission?: A extends "member" ? RoutePermission : never;
  schema: S;
  /** Requests allowed per client address in the window. Routes that take a secret or create something should set one. */
  rateLimit?: RateLimit;
  handler: (ctx: RouteContext<S, A>) => Promise<Infer<S["response"]>>;
};

declare module "fastify" {
  interface FastifyContextConfig {
    /** The route is a "member" route: the session hook scopes it and checks `permission`. */
    member?: boolean;
    permission?: RoutePermission;
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
  if ((definition.auth === "member") !== Boolean(definition.permission)) {
    throw new Error(`Route ${definition.method} ${definition.url}: member routes, and only they, declare a permission.`);
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
  if (auth === "public" || auth === "member") return undefined;
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
      config: {
        member: route.auth === "member",
        ...(route.permission ? { permission: route.permission } : {}),
        ...(route.rateLimit ? { rateLimit: route.rateLimit } : {}),
      },
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
