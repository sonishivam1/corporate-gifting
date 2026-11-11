import "server-only";

import type { Address } from "@gifting/domain";

/**
 * Calls to the Gifting API. Apps talk only to the API, never to commercetools,
 * the database or providers (ADR 0004).
 */
const API_URL = process.env.API_PUBLIC_URL ?? "http://localhost:4000";

export type ApiMeta = {
  name: string;
  version: string;
  modules: { name: string; milestone: string; routes: number }[];
};

export async function getApiMeta(): Promise<ApiMeta | null> {
  try {
    const res = await fetch(`${API_URL}/v1/meta`, { cache: "no-store", signal: AbortSignal.timeout(2000) });
    return res.ok ? ((await res.json()) as ApiMeta) : null;
  } catch {
    return null;
  }
}

export type Problem = "invalid" | "used" | "expired";
export type LinkView = { state: Problem } | { state: "open"; from: string; headline: string; message: string; expiresOn: string; cover: string; occasion: string; brandColor: string | null };
export type Item = { sku: string; name: string; brand: string; description: string; category: string; vendorName: string; slaDays: number };
// bundle: every item ships, nothing to choose. allInStock: whether the bundle can be claimed now.
export type ItemsView = { state: Problem } | { state: "open"; items: Item[]; bundle: boolean; allInStock: boolean };
export type ItemView = { state: Problem | "unavailable" } | { state: "open"; item: Item };
export type OrderView = { state: "invalid" | "pending" } | { state: "ordered"; orderNumber: string; status: "ordered" | "shipped" | "delivered" };
export type RedeemOutcome = { ok: true; orderNumber: string } | { ok: false; code: string };

async function get<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API_URL}${path}`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

const enc = encodeURIComponent;
export const getLink = (token: string) => get<LinkView>(`/v1/r/${enc(token)}`);
export const getItems = (token: string) => get<ItemsView>(`/v1/r/${enc(token)}/items`);
export const getItem = (token: string, sku: string) => get<ItemView>(`/v1/r/${enc(token)}/items/${enc(sku)}`);
export const getOrder = (token: string) => get<OrderView>(`/v1/r/${enc(token)}/order`);

/** Chooses a gift, or claims a bundle (no SKU: every item is ordered). The token travels server to server only. */
export async function redeemGift(token: string, sku: string | null, address: Address): Promise<RedeemOutcome> {
  try {
    const res = await fetch(`${API_URL}/v1/r/${enc(token)}/redeem`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(sku ? { sku, address } : { address }),
      cache: "no-store",
      signal: AbortSignal.timeout(30000),
    });
    const body = (await res.json().catch(() => null)) as { orderNumber?: string; error?: { code?: string } } | null;
    if (res.ok && body?.orderNumber) return { ok: true, orderNumber: body.orderNumber };
    return { ok: false, code: body?.error?.code ?? "try_again" };
  } catch {
    return { ok: false, code: "try_again" };
  }
}
