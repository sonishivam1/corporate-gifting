import { randomUUID } from "node:crypto";

import { getCollections } from "@gifting/db";
import {
  type Cents,
  type CollectionInput,
  type CollectionView,
  type GiftCollection,
  type ProductQuery,
  type ProductView,
  rulesFromInput,
  type SendInput,
  variantName,
  withVariants,
} from "@gifting/domain";

import type { AppDeps } from "../../deps";
import { ApiError } from "../../http/errors";
import type { Session } from "../../http/session";

/** Names compare without case: "Team Treats" and "team treats" are one name. */
const NAME_COLLATION = { locale: "en", strength: 2 } as const;

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

  /** A platform or company collection, archived ones included: gifts already sent still read them. */
  async function findCollection(companyKey: string, id: string): Promise<GiftCollection> {
    const col = await c().collections.findOne({ _id: id, owner: { $in: ["platform", companyKey] } });
    if (!col) throw new ApiError(404, "collection_not_found", "Collection not found.");
    return col;
  }

  /** One of the company's own active collections; platform and other companies' are "not found". */
  async function ownCollection(companyKey: string, id: string): Promise<GiftCollection> {
    const col = await c().collections.findOne({ _id: id, owner: companyKey, archivedAt: null });
    if (!col) throw new ApiError(404, "collection_not_found", "Collection not found.");
    return col;
  }

  async function checkNameFree(companyKey: string, name: string, exceptId?: string) {
    const taken = await c().collections.findOne(
      { owner: companyKey, archivedAt: null, name, ...(exceptId ? { _id: { $ne: exceptId } } : {}) },
      { collation: NAME_COLLATION, projection: { _id: 1 } },
    );
    if (taken) throw new ApiError(409, "collection_name_taken", "Your company already has a collection with that name.");
  }

  async function viewOf(col: GiftCollection): Promise<CollectionView> {
    return toView(col, await deps.catalog.collectionItems(col.rules, col.budgetBandCents));
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

    /** The company's own collections first, then the platform's; archived ones are hidden. */
    async collections(companyKey: string, budgetCents?: Cents): Promise<CollectionView[]> {
      const cols = await c()
        .collections.find({ owner: { $in: ["platform", companyKey] }, archivedAt: null })
        .sort({ budgetBandCents: 1, name: 1 })
        .toArray();
      const ordered = [...cols.filter((col) => col.owner !== "platform"), ...cols.filter((col) => col.owner === "platform")];
      return Promise.all(ordered.map(async (col) => toView(col, await deps.catalog.collectionItems(col.rules, budgetCents ?? col.budgetBandCents))));
    },

    /** A collection for the whole company, built by any member (plan: build-your-own-collection.md). */
    async createCollection(session: Session, input: CollectionInput): Promise<CollectionView> {
      await checkNameFree(session.companyKey, input.name);
      const now = deps.now();
      const col: GiftCollection = {
        _id: `col-${randomUUID()}`,
        owner: session.companyKey,
        name: input.name,
        rules: rulesFromInput(input),
        countries: ["US"],
        budgetBandCents: input.budgetBandCents,
        createdBy: session.userId,
        updatedBy: session.userId,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      await c().collections.insertOne(col);
      return viewOf(col);
    },

    /**
     * Replaces a company collection's name, band and rules. Gifts not yet
     * redeemed see the change; their budgets were held when they were sent.
     */
    async updateCollection(session: Session, id: string, input: CollectionInput): Promise<CollectionView> {
      await ownCollection(session.companyKey, id);
      await checkNameFree(session.companyKey, input.name, id);
      const updated = await c().collections.findOneAndUpdate(
        { _id: id, owner: session.companyKey, archivedAt: null },
        {
          $set: {
            name: input.name,
            rules: rulesFromInput(input),
            budgetBandCents: input.budgetBandCents,
            updatedBy: session.userId,
            updatedAt: deps.now(),
          },
        },
        { returnDocument: "after" },
      );
      if (!updated) throw new ApiError(404, "collection_not_found", "Collection not found.");
      return viewOf(updated);
    },

    /** Hides a company collection from lists and new campaigns. Archiving it again changes nothing. */
    async archiveCollection(session: Session, id: string): Promise<void> {
      const res = await c().collections.updateOne(
        { _id: id, owner: session.companyKey, archivedAt: null },
        { $set: { archivedAt: deps.now(), updatedBy: session.userId, updatedAt: deps.now() } },
      );
      if (res.matchedCount) return;
      if (!(await c().collections.findOne({ _id: id, owner: session.companyKey }, { projection: { _id: 1 } }))) {
        throw new ApiError(404, "collection_not_found", "Collection not found.");
      }
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
      if (col.archivedAt) throw new ApiError(422, "collection_archived", "That collection has been archived. Pick another.");
      if ((await deps.catalog.collectionItems(col.rules, gift.budgetCents)).length === 0) {
        throw new ApiError(422, "collection_empty", "Nothing in this collection fits that budget.");
      }
      return { kind: "collection", collectionId: col._id, sku: null, label: col.name, budgetCents: gift.budgetCents };
    },
  };
}
