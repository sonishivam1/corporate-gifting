import type { FastifyInstance, FastifyReply, FastifyRequest, HTTPMethods } from "fastify";
import type { z } from "zod";

/**
 * Every route is defined here: Zod schemas for params, query, body and
 * response (ADR 0010). Input that fails its schema is a 400; the response is
 * parsed too, so fields the schema doesn't list never leave the API.
 */
export type RouteSchema = {
  params?: z.ZodType;
  query?: z.ZodType;
  body?: z.ZodType;
  response?: z.ZodType;
};

type Infer<T> = T extends z.ZodType ? z.infer<T> : undefined;

export type RouteContext<S extends RouteSchema> = {
  params: Infer<S["params"]>;
  query: Infer<S["query"]>;
  body: Infer<S["body"]>;
  request: FastifyRequest;
  reply: FastifyReply;
};

export type RouteDefinition<S extends RouteSchema = RouteSchema> = {
  method: HTTPMethods;
  url: string;
  schema: S;
  handler: (ctx: RouteContext<S>) => Promise<Infer<S["response"]>>;
};

export function defineRoute<S extends RouteSchema>(definition: RouteDefinition<S>): RouteDefinition<S> {
  if (definition.url !== "/health" && !definition.url.startsWith("/v1/")) {
    throw new Error(`Route ${definition.url} must live under /v1 (only /health is unversioned).`);
  }
  return definition;
}

const parse = (schema: z.ZodType | undefined, value: unknown) => (schema ? schema.parse(value) : undefined);

export function registerRoutes(app: FastifyInstance, routes: readonly RouteDefinition[]): void {
  for (const route of routes) {
    app.route({
      method: route.method,
      url: route.url,
      handler: async (request, reply) => {
        const result = await route.handler({
          params: parse(route.schema.params, request.params),
          query: parse(route.schema.query, request.query),
          body: parse(route.schema.body, request.body),
          request,
          reply,
        } as RouteContext<RouteSchema>);
        return route.schema.response ? route.schema.response.parse(result) : result;
      },
    });
  }
}
