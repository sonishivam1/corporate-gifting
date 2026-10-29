import { collectionView, productQuery, productView } from "@gifting/domain";
import { z } from "zod";

import { defineRoute } from "../../http/route";
import { requireSession } from "../../http/session";
import type { CatalogService } from "./service";

const budget = z.object({ budget: z.coerce.number().int().positive().optional() });

export function catalogRoutes(catalog: CatalogService) {
  return [
    defineRoute({
      method: "GET",
      url: "/v1/catalog/products",
      schema: { query: productQuery, response: z.object({ products: z.array(productView) }) },
      handler: async ({ query, request }) => {
        requireSession(request);
        return { products: await catalog.products(query) };
      },
    }),
    defineRoute({
      method: "GET",
      url: "/v1/collections",
      schema: { query: budget, response: z.object({ collections: z.array(collectionView) }) },
      handler: async ({ query, request }) => {
        const session = requireSession(request);
        return { collections: await catalog.collections(session.companyKey, query.budget) };
      },
    }),
    defineRoute({
      method: "GET",
      url: "/v1/collections/:id/items",
      schema: { params: z.object({ id: z.string().min(1) }), query: budget, response: z.object({ items: z.array(productView) }) },
      handler: async ({ params, query, request }) => {
        const session = requireSession(request);
        return { items: await catalog.collectionItems(session.companyKey, params.id, query.budget) };
      },
    }),
  ];
}
