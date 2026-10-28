// pnpm catalog:extract — reads the Christie Cookie storefront and writes a
// catalog snapshot to .data/catalogs/christie-cookie.json (gitignored). Used
// with the client's written permission for the POC
// (docs/plans/christie-catalog-import.md). Polite: one page a second, a user
// agent that names us, and only category and product pages (robots.txt
// allows them). Product images stay on the storefront's CDN; only the first
// bytes of each are read, for their dimensions.
//
// --retry-skipped re-reads only the pages the last snapshot skipped and
// merges what it finds, instead of reading the whole storefront again.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import { AppError, createLogger } from "@gifting/logger";

import {
  CHRISTIE_BASE_URL,
  CHRISTIE_ROOT_CATEGORY,
  CHRISTIE_VENDOR,
  linkCategories,
  pageCategories,
  productFromPage,
  productLinks,
} from "../src/christie";
import { flightRows } from "../src/flight";
import { imageSize } from "../src/image-size";
import { type CatalogCategory, type CatalogProduct, type CatalogSnapshot, catalogSnapshotSchema, snapshotPath } from "../src/snapshot";

const log = createLogger("catalog:extract");
const USER_AGENT = "GiftingMarketplacePOC/0.1 (catalog import for the Christie Cookie POC, with permission)";
const PAGE_DELAY_MS = 1_000;
const IMAGE_DELAY_MS = 150;
const MAX_PAGES = 600;

let pagesFetched = 0;

async function fetchPage(url: string): Promise<string | undefined> {
  if (pagesFetched >= MAX_PAGES) throw new AppError("too_many_pages", `Stopped after ${MAX_PAGES} pages.`);
  pagesFetched += 1;
  await sleep(PAGE_DELAY_MS);
  const response = await fetch(url, { headers: { "user-agent": USER_AGENT } });
  if (!response.ok) {
    log.warn({ url, status: response.status }, "page not fetched");
    return undefined;
  }
  return response.text();
}

async function readImageSize(url: string) {
  await sleep(IMAGE_DELAY_MS);
  try {
    const response = await fetch(url, { headers: { "user-agent": USER_AGENT, range: "bytes=0-262143" } });
    if (!response.ok) return undefined;
    return imageSize(new Uint8Array(await response.arrayBuffer()));
  } catch {
    return undefined;
  }
}

try {
  const file = snapshotPath("christie-cookie");
  const previous: CatalogSnapshot | undefined = process.argv.includes("--retry-skipped")
    ? catalogSnapshotSchema.parse(JSON.parse(await readFile(file, "utf8")))
    : undefined;
  const slugOf = (url: string) => url.slice(url.indexOf("/p/") + 3);

  const categories = new Map<string, CatalogCategory>(previous?.categories.map((c) => [c.path, c]));
  const productQueue = new Set<string>(previous?.skipped.map((s) => slugOf(s.url)));
  const addCategories = (found: CatalogCategory[]) => found.forEach((c) => categories.set(c.path, c));

  // 1. Category pages: the category tree and the products each lists.
  const categoryPages = new Set(previous ? [] : ["/shop-by-tin", "/shop-by-treat", "/shop-by-gift-occasion"]);
  const visitedCategories = new Set<string>();
  while (visitedCategories.size < categoryPages.size) {
    const next = [...categoryPages].find((p) => !visitedCategories.has(p))!;
    visitedCategories.add(next);
    const html = await fetchPage(`${CHRISTIE_BASE_URL}/category${next}`);
    if (!html) continue;
    addCategories(pageCategories(flightRows(html)));
    productLinks(html).forEach((slug) => productQueue.add(slug));
    for (const category of categories.values()) categoryPages.add(category.path.replace(/^\/diplay_categories/, ""));
  }
  for (const page of previous ? [] : ["/holiday-gift-tins", "/corporate-gifts"]) {
    const html = await fetchPage(`${CHRISTIE_BASE_URL}${page}`);
    if (html) productLinks(html).forEach((slug) => productQueue.add(slug));
  }
  log.info({ categoryPages: visitedCategories.size, categories: categories.size, productLinks: productQueue.size }, "categories read");

  // 2. Product pages. Each also links to related products, which join the queue.
  const products = new Map<string, CatalogProduct>(previous?.products.map((p) => [p.key, p]));
  const skipped: { url: string; reason: string }[] = [];
  const skus = new Set<string>([...products.values()].flatMap((p) => p.variants.map((v) => v.sku)));
  const visitedProducts = new Set<string>(previous?.products.map((p) => slugOf(p.sourceUrl)));
  for (const slug of visitedProducts) productQueue.add(slug);
  while (visitedProducts.size < productQueue.size) {
    const slug = [...productQueue].find((s) => !visitedProducts.has(s))!;
    visitedProducts.add(slug);
    const url = `${CHRISTIE_BASE_URL}/p/${slug}`;
    const html = await fetchPage(url);
    if (!html) {
      skipped.push({ url, reason: "page not fetched" });
      continue;
    }
    productLinks(html).forEach((s) => productQueue.add(s));
    const rows = flightRows(html);
    addCategories(pageCategories(rows));
    const result = productFromPage(rows, slug);
    if ("skip" in result) {
      skipped.push({ url, reason: result.skip });
      continue;
    }
    addCategories(result.categories);
    const { product } = result;
    if (products.has(product.key)) continue;
    // A SKU belongs to one product only; a repeat would clash in commercetools.
    const variants = product.variants.filter((v) => !skus.has(v.sku));
    if (variants.length === 0) {
      skipped.push({ url, reason: "every SKU is already on another product" });
      continue;
    }
    variants.forEach((v) => skus.add(v.sku));
    products.set(product.key, { ...product, variants });
    if (products.size % 20 === 0) log.info({ products: products.size, queued: productQueue.size }, "reading products");
  }

  // 3. Image dimensions, from the first bytes of each image.
  let images = 0;
  for (const product of products.values()) {
    for (const variant of product.variants) {
      for (const image of variant.images) {
        if (image.w && image.h) continue;
        const size = await readImageSize(image.url);
        if (size) Object.assign(image, size);
        images += 1;
      }
    }
  }

  const linked = linkCategories([...categories.values()]);
  const snapshot = catalogSnapshotSchema.parse({
    source: CHRISTIE_BASE_URL,
    extractedAt: new Date().toISOString(),
    vendor: CHRISTIE_VENDOR,
    rootCategory: CHRISTIE_ROOT_CATEGORY,
    categories: linked,
    products: [...products.values()].map((p) => ({ ...p, categoryKeys: p.categoryKeys.filter((k) => linked.some((c) => c.key === k)) })),
    skipped,
  });
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  log.info(
    {
      file: path.relative(process.cwd(), file),
      pages: pagesFetched,
      categories: snapshot.categories.length,
      products: snapshot.products.length,
      variants: snapshot.products.reduce((n, p) => n + p.variants.length, 0),
      images,
      skipped: skipped.length,
    },
    "snapshot written",
  );
} catch (err) {
  log.error({ err }, "catalog:extract failed");
  process.exitCode = 1;
}
