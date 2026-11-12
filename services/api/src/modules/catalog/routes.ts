import { collectionInput, collectionView, productQuery, productView } from "@gifting/domain";
import { z } from "zod";

import { defineRoute } from "../../http/route";
import { requireSession } from "../../http/session";
import type { CatalogService } from "./service";

const budget = z.object({ budget: z.coerce.number().int().positive().optional() });
const byId = z.object({ id: z.string().min(1) });

export function catalogRoutes(catalog: CatalogService) {
  return [
    defineRoute({
      method: "GET",
      url: "/v1/catalog/products",
      auth: "member",
      permission: "catalog:view",
      schema: { query: productQuery, response: z.object({ products: z.array(productView) }) },
      handler: async ({ query, request }) => {
        requireSession(request);
        return { products: await catalog.products(query) };
      },
    }),
    defineRoute({
      method: "GET",
      url: "/v1/collections",
      auth: "member",
      permission: "catalog:view",
      schema: { query: budget, response: z.object({ collections: z.array(collectionView) }) },
      handler: async ({ query, request }) => {
        const session = requireSession(request);
        return { collections: await catalog.collections(session.companyKey, query.budget) };
      },
    }),
    defineRoute({
      method: "GET",
      url: "/v1/collections/:id/items",
      auth: "member",
      permission: "catalog:view",
      schema: { params: z.object({ id: z.string().min(1) }), query: budget, response: z.object({ items: z.array(productView) }) },
      handler: async ({ params, query, request }) => {
        const session = requireSession(request);
        return { items: await catalog.collectionItems(session.companyKey, params.id, query.budget) };
      },
    }),
    // Company collections (plan: build-your-own-collection.md). Any member may
    // build, edit or archive one; platform collections can't be changed.
    defineRoute({
      method: "POST",
      url: "/v1/collections",
      auth: "member",
      permission: "collection:manage",
      schema: { body: collectionInput, response: collectionView },
      handler: async ({ body, request }) => catalog.createCollection(requireSession(request), body),
    }),
    defineRoute({
      method: "PUT",
      url: "/v1/collections/:id",
      auth: "member",
      permission: "collection:manage",
      schema: { params: byId, body: collectionInput, response: collectionView },
      handler: async ({ params, body, request }) => catalog.updateCollection(requireSession(request), params.id, body),
    }),
    defineRoute({
      method: "POST",
      url: "/v1/collections/:id/archive",
      auth: "member",
      permission: "collection:manage",
      schema: { params: byId, response: z.object({ archived: z.literal(true) }) },
      handler: async ({ params, request }) => {
        await catalog.archiveCollection(requireSession(request), params.id);
        return { archived: true as const };
      },
    }),
  ];
}
