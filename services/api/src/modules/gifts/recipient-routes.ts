import { address } from "@gifting/domain";
import { z } from "zod";

import { ApiError } from "../../http/errors";
import { defineRoute } from "../../http/route";
import type { RedeemService } from "./redeem";

/** Link tokens are 43 characters (32 bytes, base64url). Anything outside this shape is refused before it reaches storage. */
const token = z.string().regex(/^[A-Za-z0-9_-]{20,100}$/, "Not a gift link.");
const sku = z.string().regex(/^[A-Za-z0-9._-]{1,128}$/);

const item = z.object({ sku: z.string(), name: z.string(), brand: z.string(), description: z.string(), category: z.string(), vendorName: z.string(), slaDays: z.number() });
const problem = z.enum(["invalid", "used", "expired"]);

/** Always 200: an invalid, used or expired link is an answer the page shows, not a failure. */
const linkView = z.discriminatedUnion("state", [
  z.object({ state: problem }),
  z.object({ state: z.literal("open"), from: z.string(), headline: z.string(), message: z.string(), expiresOn: z.string(), cover: z.string(), occasion: z.string(), brandColor: z.string().nullable() }),
]);

const itemsView = z.discriminatedUnion("state", [
  z.object({ state: problem }),
  // bundle: every item ships, there is nothing to choose. allInStock: whether the bundle can be claimed now.
  z.object({ state: z.literal("open"), items: z.array(item), bundle: z.boolean(), allInStock: z.boolean() }),
]);
const itemView = z.discriminatedUnion("state", [z.object({ state: z.enum(["invalid", "used", "expired", "unavailable"]) }), z.object({ state: z.literal("open"), item })]);
const orderView = z.discriminatedUnion("state", [
  z.object({ state: z.enum(["invalid", "pending"]) }),
  z.object({ state: z.literal("ordered"), orderNumber: z.string(), status: z.enum(["ordered", "shipped", "delivered"]) }),
]);

const FAILURES = {
  invalid: [404, "not_found", "Not found."],
  used: [409, "gift_used", "This gift has already been chosen."],
  expired: [410, "gift_expired", "This gift has expired."],
  "item-unavailable": [409, "item_unavailable", "That gift can't be sent right now. Please choose another."],
  "bundle-unavailable": [409, "bundle_unavailable", "One of your gifts is out of stock right now. Please try again later."],
  "try-again": [503, "try_again", "We couldn't finish that. Please try again in a moment."],
} as const;

// A link is a secret, so guessing is limited per client address. Choosing is stricter: it creates an order.
const OPEN_LIMIT = { max: 60, timeWindow: "1 minute" };
const REDEEM_LIMIT = { max: 10, timeWindow: "1 minute" };

/** The recipient's side (docs/technical/api.md, M4). The secret in the path is the credential, so there is no session. */
export function recipientRoutes(redeem: RedeemService) {
  return [
    defineRoute({ method: "GET", auth: "public", url: "/v1/r/:token", rateLimit: OPEN_LIMIT, schema: { params: z.object({ token }), response: linkView }, handler: async ({ params }) => redeem.view(params.token) }),
    defineRoute({ method: "GET", auth: "public", url: "/v1/r/:token/items", rateLimit: OPEN_LIMIT, schema: { params: z.object({ token }), response: itemsView }, handler: async ({ params }) => redeem.items(params.token) }),
    defineRoute({
      method: "GET", auth: "public",
      url: "/v1/r/:token/items/:sku",
      rateLimit: OPEN_LIMIT,
      schema: { params: z.object({ token, sku }), response: itemView },
      handler: async ({ params }) => redeem.item(params.token, params.sku),
    }),
    defineRoute({ method: "GET", auth: "public", url: "/v1/r/:token/order", rateLimit: OPEN_LIMIT, schema: { params: z.object({ token }), response: orderView }, handler: async ({ params }) => redeem.order(params.token) }),
    defineRoute({
      method: "POST", auth: "public",
      url: "/v1/r/:token/redeem",
      rateLimit: REDEEM_LIMIT,
      // A bundle needs no sku: every item is ordered. Choosing from several needs one.
      schema: { params: z.object({ token }), body: z.object({ sku: sku.optional(), address }), response: z.object({ orderNumber: z.string(), sku: z.string(), skus: z.array(z.string()) }) },
      handler: async ({ params, body, reply }) => {
        const result = await redeem.redeem({ token: params.token, sku: body.sku, address: body.address });
        if (result.ok) return { orderNumber: result.orderNumber, sku: result.sku, skus: result.skus };
        const [status, code, message] = FAILURES[result.reason];
        if (result.reason === "try-again") void reply.header("Retry-After", "5");
        throw new ApiError(status, code, message);
      },
    }),
  ];
}
