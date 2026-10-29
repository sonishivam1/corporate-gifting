import {
  campaignDetailView,
  campaignListQuery,
  campaignListView,
  decisionResultView,
  estimateView,
  sendInput,
  submitResultView,
} from "@gifting/domain";
import { z } from "zod";

import { defineRoute } from "../../http/route";
import { requireSession } from "../../http/session";
import type { CampaignsService } from "./service";

const byId = z.object({ id: z.string().min(1) });
const idempotencyKey = z.uuid().nullable();

export function campaignsRoutes(campaigns: CampaignsService) {
  return [
    defineRoute({
      method: "GET",
      url: "/v1/campaigns",
      auth: "workspace",
      schema: { query: campaignListQuery, response: campaignListView },
      handler: async ({ query, request }) => campaigns.list(requireSession(request), query),
    }),
    defineRoute({
      method: "POST",
      url: "/v1/campaigns/estimate",
      auth: "workspace",
      schema: { body: sendInput, response: estimateView },
      handler: async ({ body, request }) => campaigns.estimate(requireSession(request), body),
    }),
    defineRoute({
      method: "POST",
      url: "/v1/campaigns",
      auth: "workspace",
      schema: { body: sendInput, response: z.object({ id: z.string() }) },
      handler: async ({ body, request, reply }) => {
        const key = idempotencyKey.parse(request.headers["idempotency-key"] ?? null);
        const created = await campaigns.create(requireSession(request), body, key);
        reply.status(201);
        return created;
      },
    }),
    defineRoute({
      method: "GET",
      url: "/v1/campaigns/:id",
      auth: "workspace",
      schema: { params: byId, response: campaignDetailView },
      handler: async ({ params, request }) => campaigns.detail(requireSession(request), params.id),
    }),
    defineRoute({
      method: "POST",
      url: "/v1/campaigns/:id/estimate",
      auth: "workspace",
      schema: { params: byId, response: estimateView },
      handler: async ({ params, request }) => campaigns.estimateSaved(requireSession(request), params.id),
    }),
    defineRoute({
      method: "POST",
      url: "/v1/campaigns/:id/submit",
      auth: "workspace",
      schema: { params: byId, response: submitResultView },
      handler: async ({ params, request }) => campaigns.submit(requireSession(request), params.id),
    }),
    defineRoute({
      method: "POST",
      url: "/v1/campaigns/:id/approve",
      auth: "workspace",
      schema: { params: byId, response: decisionResultView },
      handler: async ({ params, request }) => campaigns.decide(requireSession(request), params.id, "approved"),
    }),
    defineRoute({
      method: "POST",
      url: "/v1/campaigns/:id/decline",
      auth: "workspace",
      schema: { params: byId, response: decisionResultView },
      handler: async ({ params, request }) => campaigns.decide(requireSession(request), params.id, "rejected"),
    }),
  ];
}
