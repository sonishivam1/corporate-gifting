/**
 * Runs the catalog's real queries against the commercetools project and
 * prints counts and timings (spike 2). Read-only. Needs the API client in
 * `.env` (`CTP_API_*`). Prints ids, counts and SKUs only, never credentials.
 *
 *   pnpm --filter @gifting/api catalog:check
 */
import { collectionSearchQuery, createCtApi, loadCtApiConfig, readVendors, searchProducts } from "@gifting/ct";
import { collectionItems } from "@gifting/domain";
import { createLogger } from "@gifting/logger";
import { demoCollections } from "@gifting/seed";

import { ctCatalog, ctReader } from "../src/modules/catalog/ct-source";
import { seedOccasions } from "../src/modules/catalog/source";

const log = createLogger("catalog-check");

async function timed<T>(what: string, run: () => Promise<T>): Promise<T> {
  const start = performance.now();
  const result = await run();
  log.info({ ms: Math.round(performance.now() - start) }, what);
  return result;
}

try {
  const api = createCtApi(loadCtApiConfig());
  const catalog = ctCatalog({
    reader: ctReader(api),
    fallbackOccasions: (sku) => seedOccasions.get(sku),
    onError: (err) => log.error({ err }, "catalog read failed"),
  });

  const products = await timed("listing (cold)", () => catalog.products());
  await timed("listing (cached)", () => catalog.products());
  const variants = products.flatMap((p) => p.variants);
  log.info(
    {
      products: products.length,
      variants: variants.length,
      available: products.filter((p) => p.available).length,
      withImages: products.filter((p) => p.imageUrl).length,
      vendors: new Set(products.map((p) => p.vendorKey)).size,
      withoutOccasions: products.filter((p) => p.occasions.length === 0).length,
    },
    "catalog",
  );

  const vendors = await readVendors(api);
  for (const col of demoCollections) {
    const items = await timed(`collection ${col.id} at ${col.budgetBandCents}`, () => catalog.collectionItems(col.rules, col.budgetBandCents));
    // The reference: the same rules applied in memory to the listing. Search should find exactly these.
    const key = (list: typeof items) => list.flatMap((p) => p.variants.map((v) => v.sku)).sort().join();
    const reference = collectionItems(col.rules, products, col.budgetBandCents);
    // Spike 2's question: does the search alone find them, before the source checks each variant again?
    const hits = await searchProducts(api, collectionSearchQuery(col.rules, col.budgetBandCents, vendors));
    log.info(
      {
        collection: col.id,
        items: items.length,
        vendors: new Set(items.map((p) => p.vendorKey)).size,
        matchesReference: key(items) === key(reference),
        searchProducts: hits.length,
        referenceProducts: reference.length,
        allVariantsMatched: hits.filter((h) => h.skus === null).length,
      },
      "collection",
    );
  }

  const sample = variants.find((v) => v.available);
  if (sample) {
    const found = await timed("one SKU, live", () => catalog.variant(sample.sku));
    log.info({ sku: sample.sku, found: Boolean(found), priceCents: found?.variant.priceCents }, "live read");
  }
} catch (err) {
  log.fatal({ err }, "catalog check failed");
  process.exit(1);
}
