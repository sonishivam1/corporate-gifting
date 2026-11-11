"use server";

import { address } from "@gifting/domain";

import { redeemGift } from "@/lib/api";
import { TOKEN_SHAPE } from "@/lib/link";

export type ShipInput = { name: string; line1: string; line2: string; city: string; region: string; postalCode: string };
export type ShipResult = { ok: true; orderNumber: string } | { ok: false; code: string; fields?: string[] };

/** Runs on the server: the address is checked again here, and the link token never appears in the browser's own requests to the API. */
export async function claimGift(token: string, sku: string | null, input: ShipInput): Promise<ShipResult> {
  if (!TOKEN_SHAPE.test(token)) return { ok: false, code: "invalid" };
  const parsed = address.safeParse({ ...input, line2: input.line2.trim() === "" ? null : input.line2, country: "US" });
  if (!parsed.success) return { ok: false, code: "invalid_address", fields: parsed.error.issues.map((i) => String(i.path[0])) };
  return redeemGift(token, sku, parsed.data);
}
