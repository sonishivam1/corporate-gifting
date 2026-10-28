/**
 * Turns Christie Cookie storefront pages into catalog snapshot records. The
 * storefront (Next.js on commercetools) embeds each product, with its
 * categories and variants, in the page's flight payload. Pure: the extract
 * script fetches, this reads. Used with the client's written permission for
 * the POC (docs/plans/christie-catalog-import.md).
 */
import { z } from "zod";

import { findObjects, type FlightRows } from "./flight";
import type { CatalogCategory, CatalogProduct, CatalogVariant, CatalogVendor } from "./snapshot";

export const CHRISTIE_BASE_URL = "https://www.christiecookies.com";

/**
 * The vendor as our marketplace sees it. The contact address is a
 * placeholder on purpose: the POC must never email the real company.
 */
export const CHRISTIE_VENDOR: CatalogVendor = {
  key: "vendor-christie-cookie",
  name: "The Christie Cookie Co.",
  brand: "Christie Cookie Co.",
  contactEmail: "christie-cookie@vendors.example",
  fulfilmentMethod: "portal",
  slaDays: 3,
};

export const CHRISTIE_ROOT_CATEGORY: CatalogCategory = {
  key: "christie-cookie",
  name: "Christie Cookie Co.",
  slug: "christie-cookie",
  path: "/diplay_categories",
};

/** What the marketplace adds to every Christie product: baked goods, shipped in the US. */
export const CHRISTIE_GIFTING = {
  categoryKeys: ["gifts-food-treats"],
  perishable: true,
  shipsTo: ["US"],
};

/** Every Christie product is tagged with these, besides its category slugs. */
const BASE_TAGS = ["food", "sweet", "cookies"];

const STOREFRONT_ROOT = "/diplay_categories";

const storefrontCategory = z.object({
  categoryId: z.string().min(1),
  name: z.string().min(1),
  slug: z.string().min(1),
  depth: z.number(),
  _url: z.string().startsWith(STOREFRONT_ROOT),
});

const label = z.object({ label: z.string() }).transform((v) => v.label);

const storefrontVariant = z.object({
  sku: z.string().min(1),
  price: z.object({ centAmount: z.number().int(), currencyCode: z.string() }).optional(),
  images: z.array(z.string()).optional(),
  imagesAltText: z.array(z.string().nullable()).optional(),
  isOnStock: z.boolean().optional(),
  attributes: z
    .object({
      cookie_flavor: label.optional().catch(undefined),
      assortment_count: label.optional().catch(undefined),
      tin_color: label.optional().catch(undefined),
      itemType: z.string().optional().catch(undefined),
      isCorporateTin: z.boolean().optional().catch(undefined),
    })
    .optional(),
});

const storefrontProduct = z.object({
  productId: z.string(),
  slug: z.string(),
  name: z.string().min(1),
  description: z.string().optional(),
  metaTitle: z.string().optional(),
  metaDescription: z.string().optional(),
  categories: z.array(z.unknown()).optional(),
  variants: z.array(z.unknown()),
});

const keyPart = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function categoryKey(categoryId: string): string {
  return `christie-${keyPart(categoryId)}`;
}

/** The storefront's category from its path, under our Christie root. */
export function toCategory(raw: z.infer<typeof storefrontCategory>): CatalogCategory {
  const segments = raw._url.slice(STOREFRONT_ROOT.length).split("/").filter(Boolean);
  return {
    key: categoryKey(raw.categoryId),
    name: raw.name,
    slug: `christie-${keyPart(segments.join("-")) || keyPart(raw.slug)}`,
    path: raw._url,
  };
}

/** The categories a page's payload mentions (navigation, breadcrumbs, products). */
export function pageCategories(rows: FlightRows): CatalogCategory[] {
  const found = new Map<string, CatalogCategory>();
  for (const raw of findObjects(rows, ["categoryId", "depth", "_url", "name", "slug"])) {
    const parsed = storefrontCategory.safeParse(raw);
    if (parsed.success && parsed.data._url !== STOREFRONT_ROOT) found.set(parsed.data._url, toCategory(parsed.data));
  }
  return [...found.values()];
}

/**
 * Sets each category's parent from its path. A category whose parent path is
 * unknown (or the storefront root) hangs from our Christie root. Keys are
 * made unique by path, keeping the first category for a key.
 */
export function linkCategories(categories: readonly CatalogCategory[]): CatalogCategory[] {
  const byPath = new Map<string, CatalogCategory>();
  const keys = new Set<string>();
  for (const category of [...categories].sort((a, b) => a.path.localeCompare(b.path))) {
    // The storefront's own root ("Display Categories") is replaced by ours.
    if (category.path === STOREFRONT_ROOT || byPath.has(category.path) || keys.has(category.key)) continue;
    byPath.set(category.path, category);
    keys.add(category.key);
  }
  return [...byPath.values()].map((category) => {
    const parentPath = category.path.slice(0, category.path.lastIndexOf("/"));
    return { ...category, parentKey: byPath.get(parentPath)?.key ?? CHRISTIE_ROOT_CATEGORY.key };
  });
}

/** Product page slugs linked from a page. */
export function productLinks(html: string): string[] {
  return [...new Set([...html.matchAll(/\/p\/([A-Za-z0-9_-]+)/g)].map((m) => m[1]!))];
}

export type ProductResult = { product: CatalogProduct; categories: CatalogCategory[] } | { skip: string };

/** The product a product page is about, or why it can't be imported. */
export function productFromPage(rows: FlightRows, pageSlug: string): ProductResult {
  const candidates = findObjects(rows, ["productId", "slug", "variants"]);
  const raw = candidates.find((c) => c.slug === pageSlug);
  if (!raw) return { skip: "no product data on the page" };
  const parsed = storefrontProduct.safeParse(raw);
  if (!parsed.success) return { skip: `unexpected product shape: ${parsed.error.issues[0]?.message ?? "unknown"}` };
  const product = parsed.data;

  const variants: CatalogVariant[] = [];
  for (const rawVariant of product.variants) {
    const v = storefrontVariant.safeParse(rawVariant);
    if (!v.success || !v.data.price || v.data.price.currencyCode !== "USD" || v.data.price.centAmount <= 0) continue;
    const count = Number.parseInt(v.data.attributes?.assortment_count ?? "", 10);
    variants.push({
      sku: `CC-${v.data.sku}`,
      priceCents: v.data.price.centAmount,
      currency: "USD",
      inStock: v.data.isOnStock ?? true,
      images: (v.data.images ?? []).map((url, i) => {
        const alt = v.data.imagesAltText?.[i];
        return { url, ...(alt ? { label: alt } : {}) };
      }),
      attributes: {
        ...(v.data.attributes?.cookie_flavor ? { cookieFlavor: v.data.attributes.cookie_flavor } : {}),
        ...(Number.isInteger(count) && count > 0 ? { cookieCount: count } : {}),
        ...(v.data.attributes?.tin_color ? { tinColor: v.data.attributes.tin_color } : {}),
        ...(v.data.attributes?.itemType ? { itemType: v.data.attributes.itemType } : {}),
        ...(v.data.attributes?.isCorporateTin !== undefined ? { corporateTin: v.data.attributes.isCorporateTin } : {}),
      },
    });
  }
  if (variants.length === 0) return { skip: "no variant with a USD price" };

  const rawCategories = (product.categories ?? []).flatMap((c) => {
    const parsed = storefrontCategory.safeParse(c);
    return parsed.success ? [parsed.data] : [];
  });
  const categories = rawCategories.map(toCategory);
  const slug = keyPart(product.slug);
  return {
    product: {
      key: `cc-${slug}`,
      sourceUrl: `${CHRISTIE_BASE_URL}/p/${pageSlug}`,
      slug,
      name: product.name,
      ...(product.description ? { description: product.description } : {}),
      ...(product.metaTitle ? { metaTitle: product.metaTitle } : {}),
      ...(product.metaDescription ? { metaDescription: product.metaDescription } : {}),
      categoryKeys: [...new Set(categories.map((c) => c.key))],
      tags: [...new Set([...BASE_TAGS, ...rawCategories.map((c) => keyPart(c.slug))])].filter(Boolean),
      variants,
    },
    categories,
  };
}
