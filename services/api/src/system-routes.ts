import { z } from "zod";

import { defineRoute } from "./http/route";
import type { ApiModule } from "./modules/index";

export const VERSION = "0.1.0";

export const health = defineRoute({
  method: "GET",
  url: "/health",
  auth: "public",
  schema: { response: z.object({ status: z.literal("ok") }) },
  handler: async () => ({ status: "ok" as const }),
});

export function meta(modules: readonly ApiModule[]) {
  return defineRoute({
    method: "GET",
    url: "/v1/meta",
    auth: "public",
    schema: {
      response: z.object({
        name: z.string(),
        version: z.string(),
        modules: z.array(z.object({ name: z.string(), milestone: z.string(), routes: z.number() })),
      }),
    },
    handler: async () => ({
      name: "gifting-api",
      version: VERSION,
      modules: modules.map((m) => ({ name: m.name, milestone: m.milestone, routes: m.routes.length })),
    }),
  });
}
