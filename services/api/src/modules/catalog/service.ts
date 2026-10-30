import { getCollections } from "@gifting/db";
import {
  type Cents,
  type CollectionView,
  type GiftCollection,
  type ProductQuery,
  type ProductView,
  type SendInput,
  variantName,
  withVariants,
} from "@gifting/domain";

import type { AppDeps } from "../../deps";
import { ApiError } from "../../http/errors";

/** What a campaign sends, checked against the live catalog. */
export type ResolvedGift = {
  kind: "collection" | "single";
  collectionId: string | null;
  sku: string | null;
  label: string;
  // Per-gift budget: the collection budget, or the product's price.
  budgetCents: Cents;
};

export type CatalogService = ReturnType<typeof createCatalogService>;

export function createCatalogService(deps: AppDeps) {
  const c = () => getCollections(deps.db);

  function toView(col: GiftCollection, fits: readonly ProductView[]): CollectionView {
    return {
      id: col._id,
      name: col.name,
      owner: col.owner,
      budgetBandCents: col.budgetBandCents,
      rules: col.rules,
      itemCount: fits.length,
      brandCount: new Set(fits.map((p) => p.brand)).size,
      previewCategories: fits.slice(0, 4).map((p) => p.category),
    };
  }

  async function findCollection(companyKey: string, id: string): Promise<GiftCollection> {
    const col = await c().collections.findOne({ _id: id, owner: { $in: ["platform", companyKey] } });
    if (!col) throw new ApiError(404, "collection_not_found", "Collection not found.");
    return col;
  }

  return {
    /** Products with an available variant (within the budget, if given), narrowed to those variants. */
    async products(query: ProductQuery): Promise<ProductView[]> {
      const q = query.q?.toLowerCase();
      const { budget } = query;
      return (await deps.catalog.products()).flatMap((product) => {
        const p = withVariants(product, (v) => v.available && (!budget || v.priceCents <= budget));
        return p &&
          (!query.occasion || p.occasions.includes(query.occasion)) &&
          (!query.category || p.category === query.category) &&
          (!q || `${p.name} ${p.brand}`.toLowerCase().includes(q))
          ? [p]
          : [];
      });
    },

    async collections(companyKey: string, budgetCents?: Cents): Promise<CollectionView[]> {
      const cols = await c().collections.find({ owner: { $in: ["platform", companyKey] } }).sort({ budgetBandCents: 1, name: 1 }).toArray();
      return Promise.all(cols.map(async (col) => toView(col, await deps.catalog.collectionItems(col.rules, budgetCents ?? col.budgetBandCents))));
    },

    async collectionItems(companyKey: string, id: string, budgetCents?: Cents): Promise<ProductView[]> {
      const col = await findCollection(companyKey, id);
      return deps.catalog.collectionItems(col.rules, budgetCents ?? col.budgetBandCents);
    },

    /** Names for campaign rows: collection ids and variant SKUs to labels. */
    async labels(companyKey: string): Promise<{ collections: Map<string, string>; products: Map<string, string> }> {
      const [cols, items] = await Promise.all([
        c().collections.find({ owner: { $in: ["platform", companyKey] } }, { projection: { name: 1 } }).toArray(),
        deps.catalog.products(),
      ]);
      return {
        collections: new Map(cols.map((col) => [col._id, col.name])),
        products: new Map(items.flatMap((p) => p.variants.map((v) => [v.sku, variantName(p, v)] as const))),
      };
    },

    /** Re-reads the gift from the catalog: nothing about price comes from the browser. */
    async resolveGift(companyKey: string, gift: SendInput["gift"]): Promise<ResolvedGift> {
      if (gift.kind === "single") {
        const found = await deps.catalog.variant(gift.sku);
        if (!found || !found.variant.available) {
          throw new ApiError(422, "item_not_eligible", "That gift isn't available. Pick another.");
        }
        const { product, variant } = found;
        return { kind: "single", collectionId: null, sku: variant.sku, label: variantName(product, variant), budgetCents: variant.priceCents };
      }
      const col = await findCollection(companyKey, gift.collectionId);
      if ((await deps.catalog.collectionItems(col.rules, gift.budgetCents)).length === 0) {
        throw new ApiError(422, "collection_empty", "Nothing in this collection fits that budget.");
      }
      return { kind: "collection", collectionId: col._id, sku: null, label: col.name, budgetCents: gift.budgetCents };
    },
  };
}
