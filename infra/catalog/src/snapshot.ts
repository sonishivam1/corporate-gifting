/**
 * The shape of a client catalog snapshot: what an extractor writes to
 * `.data/catalogs/<vendor>.json` (gitignored) and the importer reads. Real
 * brand data lives only in that file and in the commercetools project, never
 * in git (CLAUDE.md, "Demo data").
 */
import path from "node:path";

import { z } from "zod";

export const catalogImageSchema = z.object({
  url: z.url(),
  label: z.string().optional(),
  w: z.number().int().positive().optional(),
  h: z.number().int().positive().optional(),
});

export const catalogVariantSchema = z.object({
  sku: z.string().min(1),
  priceCents: z.number().int().positive(),
  currency: z.literal("USD"),
  inStock: z.boolean(),
  images: z.array(catalogImageSchema),
  attributes: z.object({
    cookieFlavor: z.string().optional(),
    cookieCount: z.number().int().positive().optional(),
    tinColor: z.string().optional(),
    itemType: z.string().optional(),
    corporateTin: z.boolean().optional(),
  }),
});

export const catalogCategorySchema = z.object({
  key: z.string().regex(/^[A-Za-z0-9_-]{2,256}$/),
  name: z.string().min(1),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  /** The storefront's path for the category, used to find its parent. */
  path: z.string(),
  parentKey: z.string().optional(),
});

export const catalogProductSchema = z.object({
  key: z.string().regex(/^[A-Za-z0-9_-]{2,256}$/),
  sourceUrl: z.url(),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  description: z.string().optional(),
  metaTitle: z.string().optional(),
  metaDescription: z.string().optional(),
  categoryKeys: z.array(z.string()),
  tags: z.array(z.string()),
  variants: z.array(catalogVariantSchema).min(1),
});

export const catalogVendorSchema = z.object({
  key: z.string().regex(/^[a-z0-9-]{2,256}$/),
  name: z.string(),
  brand: z.string(),
  contactEmail: z.email(),
  fulfilmentMethod: z.enum(["portal", "email"]),
  slaDays: z.number().int().positive(),
});

export const catalogSnapshotSchema = z.object({
  source: z.url(),
  extractedAt: z.iso.datetime(),
  vendor: catalogVendorSchema,
  rootCategory: catalogCategorySchema,
  categories: z.array(catalogCategorySchema),
  products: z.array(catalogProductSchema),
  skipped: z.array(z.object({ url: z.string(), reason: z.string() })),
});

export type CatalogImage = z.infer<typeof catalogImageSchema>;
export type CatalogVariant = z.infer<typeof catalogVariantSchema>;
export type CatalogCategory = z.infer<typeof catalogCategorySchema>;
export type CatalogProduct = z.infer<typeof catalogProductSchema>;
export type CatalogVendor = z.infer<typeof catalogVendorSchema>;
export type CatalogSnapshot = z.infer<typeof catalogSnapshotSchema>;

/** `.data/catalogs/<vendor>.json` at the repository root (gitignored). */
export function snapshotPath(name: string): string {
  return path.resolve(import.meta.dirname, "../../../.data/catalogs", `${name}.json`);
}
