/**
 * The marketplace catalog as the Gifting API reads it (spike 2): product
 * projections mapped to `ProductView`, and collection rules turned into a
 * product search query. Pure; `catalog-reader.ts` makes the calls.
 *
 * Every product type carries the marketplace attributes from ct-setup
 * (`brand`, `vendorKey`, `tags`, ...). A vendor's stock sits at its supply
 * channel, whose key is the vendor key.
 */
import type { _SearchQuery, Attribute, ProductProjection, ProductVariant } from "@commercetools/platform-sdk";
import {
  type Cents,
  type GiftCollection,
  OCCASIONS,
  type Occasion,
  type ProductCategory,
  type ProductView,
  type VariantView,
  withVariants,
} from "@gifting/domain";

import { CT_LOCALE } from "./config";

/** A vendor as the catalog needs it, read from its supply channel. */
export type CatalogVendor = { key: string; name: string; slaDays: number; channelId: string };

/** Tags that decide the card's category, most specific first ("food" alone is the fallback). */
const CATEGORY_BY_TAG: [string, ProductCategory][] = [
  ["drink", "drink"],
  ["outdoors", "outdoors"],
  ["home", "home"],
  ["food", "food"],
];

export function categoryFromTags(tags: readonly string[]): ProductCategory {
  return CATEGORY_BY_TAG.find(([tag]) => tags.includes(tag))?.[1] ?? "food";
}

/** Storefront tags that name an occasion. Others (`under-50`, `small`) say nothing about one. */
const OCCASION_BY_TAG: [RegExp, Occasion][] = [
  [/^birthday/, "birthday"],
  [/^thank-?you/, "thanks"],
  [/^(holiday|christmas|thanksgiving)/, "holiday"],
  [/^(congratulations|graduation)/, "appreciation"],
  [/^(welcome|new-?hire)/, "newhire"],
  [/^anniversary/, "anniversary"],
];

export function occasionsFromTags(tags: readonly string[]): Occasion[] {
  const found = new Set(tags.flatMap((tag) => OCCASION_BY_TAG.filter(([re]) => re.test(tag)).map(([, o]) => o)));
  return OCCASIONS.filter((o) => found.has(o));
}

const attr = (variant: ProductVariant, name: string): unknown => variant.attributes?.find((a: Attribute) => a.name === name)?.value;
const text = (value: unknown): string | undefined => (typeof value === "string" && value.trim() ? value.trim() : undefined);
const localized = (value: Record<string, string> | undefined) => value?.[CT_LOCALE] ?? Object.values(value ?? {})[0] ?? "";

/** What describes a cookie tin variant, in order: piece count, flavour, tin colour. */
function labelParts(variant: ProductVariant): string[] {
  const count = attr(variant, "cookieCount");
  const tin = text(attr(variant, "tinColor"));
  return [typeof count === "number" ? `${count} pieces` : undefined, text(attr(variant, "cookieFlavor")), tin ? `${tin} tin` : undefined].filter(
    (part): part is string => Boolean(part),
  );
}

/**
 * Labels that tell a product's variants apart, keeping only what differs:
 * "Red tin" and "Cream tin", not the piece count and flavour they share.
 * A variant with nothing to tell it apart falls back to its SKU.
 */
export function variantLabels(variants: readonly ProductVariant[]): string[] {
  const parts = variants.map(labelParts);
  const shared = (part: string) => parts.every((p) => p.includes(part));
  return variants.map((v, i) => parts[i]!.filter((part) => !shared(part)).join(" · ") || v.sku || "");
}

/**
 * The US price in cents. Projections are read with `priceCountry: "US"` and
 * `priceCurrency: "USD"`, so commercetools fills in `price`; a variant without
 * one can't be sent.
 */
function usdCents(variant: ProductVariant): Cents | null {
  const value = variant.price?.value;
  return value && value.currencyCode === "USD" && value.fractionDigits === 2 ? value.centAmount : null;
}

/** In stock at its own vendor's channel: the vendor that ships it. */
function onStock(variant: ProductVariant, vendor: CatalogVendor): boolean {
  return variant.availability?.channels?.[vendor.channelId]?.isOnStock === true;
}

export type MapOptions = {
  vendors: ReadonlyMap<string, CatalogVendor>;
  /** Occasions to use when the tags name none (the fictional seed products have none in commercetools). */
  fallbackOccasions?: (sku: string) => readonly Occasion[] | undefined;
};

/**
 * One product card, or null when the product can't be offered: no known
 * vendor, or no variant with a US price.
 */
export function toProductView(projection: ProductProjection, options: MapOptions): ProductView | null {
  const master = projection.masterVariant;
  const vendor = options.vendors.get(text(attr(master, "vendorKey")) ?? "");
  if (!vendor) return null;

  const variants: VariantView[] = [];
  for (const variant of [master, ...projection.variants]) {
    const priceCents = usdCents(variant);
    if (!variant.sku || priceCents === null) continue;
    variants.push({
      sku: variant.sku,
      label: "",
      priceCents,
      available: onStock(variant, vendor),
      imageUrl: variant.images?.[0]?.url ?? null,
    });
  }
  if (variants.length > 1) {
    const all = [master, ...projection.variants];
    const labels = variantLabels(variants.map((v) => all.find((x) => x.sku === v.sku)!));
    variants.forEach((v, i) => (v.label = labels[i]!));
  }

  const tags = Array.isArray(attr(master, "tags")) ? (attr(master, "tags") as string[]) : [];
  const occasions = occasionsFromTags(tags);
  const first = variants[0];
  if (!first) return null;
  return withVariants({
    key: projection.key ?? projection.id,
    sku: first.sku,
    name: localized(projection.name),
    brand: text(attr(master, "brand")) ?? vendor.name,
    description: localized(projection.description),
    category: categoryFromTags(tags),
    occasions: occasions.length ? occasions : [...(options.fallbackOccasions?.(first.sku) ?? [])],
    tags,
    vendorKey: vendor.key,
    vendorName: vendor.name,
    slaDays: vendor.slaDays,
    priceCents: first.priceCents,
    currency: "USD",
    available: first.available,
    imageUrl: first.imageUrl,
    variants,
  });
}

/**
 * A product search query for a collection at a budget: matches its rules
 * (any tag, brand or SKU; everything when there are none), costs no more
 * than the budget, and is in stock at its vendor's channel. Search finds the
 * products; the caller keeps the variants that fit (`collectionItems`), since
 * the conditions are checked per variant there.
 */
export function collectionSearchQuery(rules: GiftCollection["rules"], budgetCents: Cents, vendors: readonly CatalogVendor[]): _SearchQuery {
  const ruleParts: _SearchQuery[] = [];
  if (rules.tags.length) ruleParts.push({ exact: { field: "variants.attributes.tags", fieldType: "set_text", values: rules.tags } });
  if (rules.brands.length) ruleParts.push({ exact: { field: "variants.attributes.brand", fieldType: "text", values: rules.brands } });
  const skus = [...rules.skus, ...rules.pinnedSkus];
  if (skus.length) ruleParts.push({ exact: { field: "variants.sku", values: skus } });

  const stock: _SearchQuery = {
    or: vendors.map((v) => ({
      and: [
        { exact: { field: "variants.attributes.vendorKey", fieldType: "text", value: v.key } },
        { exact: { field: "variants.availability.isOnStockForChannel", value: v.channelId } },
      ],
    })),
  };
  const parts: _SearchQuery[] = [{ range: { field: "variants.prices.centAmount", lte: budgetCents } }, stock];
  if (ruleParts.length) parts.push(ruleParts.length === 1 ? ruleParts[0]! : { or: ruleParts });
  return { and: parts };
}
