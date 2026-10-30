/**
 * Runs the catalog's real queries through the commerce connector named in
 * COMMERCE_CONNECTOR and prints counts and timings (spike 2). Read-only.
 * Prints ids, counts and SKUs only, never credentials.
 *
 *   pnpm --filter @gifting/api catalog:check
 */
import { collectionItems } from "@gifting/domain";
import { createLogger } from "@gifting/logger";
import { demoCollections } from "@gifting/seed";

import { loadConnector } from "../src/commerce/load";
import { connectorCatalog, toProductView } from "../src/modules/catalog/connector-source";
import { seedOccasions } from "../src/modules/catalog/source";

const log = createLogger("catalog-check");

async function timed<T>(what: string, run: () => Promise<T>): Promise<T> {
  const start = performance.now();
  const result = await run();
  log.info({ ms: Math.round(performance.now() - start) }, what);
  return result;
}

try {
  const connector = await loadConnector({ env: process.env, log, production: false });
  const raw = connector?.catalog;
  if (!connector || !raw) throw new Error("The connector in COMMERCE_CONNECTOR has no catalog (for commercetools, set CTP_API_CLIENT_ID).");
  const fallbackOccasions = (sku: string) => seedOccasions.get(sku);
  const catalog = connectorCatalog({ catalog: raw, fallbackOccasions, onError: (err) => log.error({ err }, "catalog read failed") });

  const products = await timed("listing (cold)", () => catalog.products());
  await timed("listing (cached)", () => catalog.products());
  const variants = products.flatMap((p) => p.variants);
  log.info(
    {
      connector: connector.id,
      products: products.length,
      variants: variants.length,
      available: products.filter((p) => p.available).length,
      withImages: products.filter((p) => p.imageUrl).length,
      vendors: new Set(products.map((p) => p.vendorKey)).size,
      withoutOccasions: products.filter((p) => p.occasions.length === 0).length,
    },
    "catalog",
  );

  const skusOf = (list: typeof products) => list.flatMap((p) => p.variants.map((v) => v.sku)).sort().join();
  const byKey = new Map(products.map((p) => [p.key, p]));
  for (const col of demoCollections) {
    const { rules } = col;
    const items = await timed(`collection ${col.id} at ${col.budgetBandCents}`, () => catalog.collectionItems(rules, col.budgetBandCents));
    // The reference: the same rules applied in memory to the whole listing.
    const reference = collectionItems(rules, products, col.budgetBandCents);
    // Spike 2's question: does the platform's search alone find them, before the product checks each variant again?
    const matches = await raw.searchItems({ tags: rules.tags, brands: rules.brands, skus: [...rules.skus, ...rules.pinnedSkus], budgetCents: col.budgetBandCents });
    const searchAlone = matches.flatMap((m) => {
      const p = byKey.get(m.key);
      const skus = m.skus;
      return p ? [{ ...p, variants: skus ? p.variants.filter((v) => skus.includes(v.sku)) : p.variants }] : [];
    });
    log.info(
      {
        collection: col.id,
        items: items.length,
        vendors: new Set(items.map((p) => p.vendorKey)).size,
        matchesReference: skusOf(items) === skusOf(reference),
        searchAloneMatchesReference: skusOf(searchAlone) === skusOf(reference),
      },
      "collection",
    );
  }

  const sample = variants.find((v) => v.available);
  if (sample) {
    const item = await timed("one SKU, live", () => raw.getItem(sample.sku));
    log.info({ sku: sample.sku, found: Boolean(item && toProductView(item, fallbackOccasions)) }, "live read");
  }
} catch (err) {
  log.fatal({ err }, "catalog check failed");
  process.exit(1);
}
