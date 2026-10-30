/**
 * The catalog on commercetools (spike 2): product projections mapped to the
 * contract's `CatalogItem`, and a collection search turned into one product
 * search query. Pure; `catalog-reader.ts` makes the calls.
 *
 * Every product type carries the marketplace attributes from ct-setup
 * (`brand`, `vendorKey`, `tags`, ...). A vendor's stock sits at its supply
 * channel, whose key is the vendor key.
 */
import type { _SearchQuery, Attribute, ProductProjection, ProductVariant } from "@commercetools/platform-sdk";
import type { CatalogItem, CatalogSearch, CatalogVariant } from "@gifting/commerce";
import { CT_LOCALE } from "@gifting/ct";

/** A vendor as the catalog needs it, read from its supply channel. */
export type CatalogVendor = { key: string; name: string; slaDays: number; channelId: string };

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
function usdCents(variant: ProductVariant): number | null {
  const value = variant.price?.value;
  return value && value.currencyCode === "USD" && value.fractionDigits === 2 ? value.centAmount : null;
}

/** In stock at its own vendor's channel: the vendor that ships it. */
function onStock(variant: ProductVariant, vendor: CatalogVendor): boolean {
  return variant.availability?.channels?.[vendor.channelId]?.isOnStock === true;
}

/**
 * One catalog item, or null when the product can't be offered: no known
 * vendor, or no variant with a US price.
 */
export function toCatalogItem(projection: ProductProjection, vendors: ReadonlyMap<string, CatalogVendor>): CatalogItem | null {
  const master = projection.masterVariant;
  const vendor = vendors.get(text(attr(master, "vendorKey")) ?? "");
  if (!vendor) return null;

  const all = [master, ...projection.variants];
  const priced = all.filter((v) => v.sku && usdCents(v) !== null);
  if (priced.length === 0) return null;
  const labels = priced.length > 1 ? variantLabels(priced) : [""];
  const variants: CatalogVariant[] = priced.map((v, i) => ({
    sku: v.sku!,
    label: labels[i]!,
    priceCents: usdCents(v)!,
    available: onStock(v, vendor),
    imageUrl: v.images?.[0]?.url ?? null,
  }));

  const tags = attr(master, "tags");
  return {
    // The product id: product search answers with ids, so matches name items by it.
    key: projection.id,
    name: localized(projection.name),
    brand: text(attr(master, "brand")) ?? vendor.name,
    description: localized(projection.description),
    tags: Array.isArray(tags) ? tags.filter((t): t is string => typeof t === "string") : [],
    vendorKey: vendor.key,
    vendorName: vendor.name,
    slaDays: vendor.slaDays,
    currency: "USD",
    variants,
  };
}

/**
 * One product search query for a collection at a budget: matches its rules
 * (any tag, brand or SKU; everything when there are none), costs no more
 * than the budget, and is in stock at its vendor's channel. With
 * `markMatchingVariants`, commercetools says which variants fit.
 */
export function collectionSearchQuery(search: CatalogSearch, vendors: readonly CatalogVendor[]): _SearchQuery {
  const ruleParts: _SearchQuery[] = [];
  if (search.tags.length) ruleParts.push({ exact: { field: "variants.attributes.tags", fieldType: "set_text", values: search.tags } });
  if (search.brands.length) ruleParts.push({ exact: { field: "variants.attributes.brand", fieldType: "text", values: search.brands } });
  if (search.skus.length) ruleParts.push({ exact: { field: "variants.sku", values: search.skus } });

  const stock: _SearchQuery = {
    or: vendors.map((v) => ({
      and: [
        { exact: { field: "variants.attributes.vendorKey", fieldType: "text", value: v.key } },
        { exact: { field: "variants.availability.isOnStockForChannel", value: v.channelId } },
      ],
    })),
  };
  const parts: _SearchQuery[] = [{ range: { field: "variants.prices.centAmount", lte: search.budgetCents } }, stock];
  if (ruleParts.length) parts.push(ruleParts.length === 1 ? ruleParts[0]! : { or: ruleParts });
  return { and: parts };
}
