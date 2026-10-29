import "server-only";

import {
  balanceView,
  campaignDetailView,
  campaignListView,
  collectionView,
  decisionResultView,
  estimateView,
  giftRowView,
  meView,
  productView,
  recipientView,
  type SendInput,
  submitResultView,
} from "@gifting/domain";
import { z } from "zod";

import { devSessionHeaders } from "./session";

/**
 * Calls to the Gifting API. Apps talk only to the API, never to commercetools,
 * the database or providers (ADR 0004). Responses are parsed with the same
 * schemas the API uses, so a drift fails loudly here.
 */
const API_URL = process.env.API_PUBLIC_URL ?? "http://localhost:4000";

export class ApiCallError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiCallError";
  }
}

const errorShape = z.object({ error: z.object({ code: z.string(), message: z.string() }) });

async function call<S extends z.ZodType>(
  path: string,
  schema: S,
  init: { method?: "GET" | "POST"; body?: unknown; headers?: Record<string, string> } = {},
): Promise<z.infer<S>> {
  // Outside the try: reading cookies is how Next marks the page dynamic, and that signal must not be swallowed.
  const session = await devSessionHeaders();
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: init.method ?? "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
      headers: {
        ...session,
        ...(init.body !== undefined ? { "content-type": "application/json" } : {}),
        ...init.headers,
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ApiCallError(503, "api_unreachable", "The Gifting API isn't reachable. Start it with pnpm dev.");
  }
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const parsed = errorShape.safeParse(json);
    throw parsed.success
      ? new ApiCallError(res.status, parsed.data.error.code, parsed.data.error.message)
      : new ApiCallError(res.status, "api_error", "The Gifting API returned an error.");
  }
  return schema.parse(json);
}

export const getMe = () => call("/v1/me", meView);

export const getBalance = (teamKey: string) => call(`/v1/teams/${encodeURIComponent(teamKey)}/balance`, balanceView);

export function getProducts(filters: { budget?: number; occasion?: string; category?: string; q?: string } = {}) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) if (v) params.set(k, String(v));
  const qs = params.size ? `?${params}` : "";
  return call(`/v1/catalog/products${qs}`, z.object({ products: z.array(productView) })).then((r) => r.products);
}

export const getCollections = (budget?: number) =>
  call(`/v1/collections${budget ? `?budget=${budget}` : ""}`, z.object({ collections: z.array(collectionView) })).then(
    (r) => r.collections,
  );

export const getRecipients = () =>
  call("/v1/recipients", z.object({ recipients: z.array(recipientView) })).then((r) => r.recipients);

export const getCampaigns = (status = "all", limit?: number) =>
  call(`/v1/campaigns?status=${status}${limit ? `&limit=${limit}` : ""}`, campaignListView);

export const getCampaign = (id: string) => call(`/v1/campaigns/${encodeURIComponent(id)}`, campaignDetailView);

export const getCampaignGifts = (id: string) =>
  call(`/v1/campaigns/${encodeURIComponent(id)}/gifts`, z.object({ gifts: z.array(giftRowView) })).then((r) => r.gifts);

export const estimateSend = (input: SendInput) => call("/v1/campaigns/estimate", estimateView, { method: "POST", body: input });

export const createCampaign = (input: SendInput, idempotencyKey: string) =>
  call("/v1/campaigns", z.object({ id: z.string() }), {
    method: "POST",
    body: input,
    headers: { "idempotency-key": idempotencyKey },
  });

export const submitCampaign = (id: string) =>
  call(`/v1/campaigns/${encodeURIComponent(id)}/submit`, submitResultView, { method: "POST" });

export const decideCampaign = (id: string, decision: "approve" | "decline") =>
  call(`/v1/campaigns/${encodeURIComponent(id)}/${decision}`, decisionResultView, { method: "POST" });
