import { memoryCatalog } from "@gifting/commerce-memory";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildApp } from "./app";
import { catalogFor, defaultDeps } from "./deps";
import type { Mailer } from "./mail/mailer";
import { seedCatalog } from "./modules/catalog/source";

describe("catalogFor", () => {
  it("serves the demo catalog when the connector has none", () => {
    expect(catalogFor(null)).toBe(seedCatalog);
    expect(catalogFor(undefined)).toBe(seedCatalog);
  });

  it("uses the connector's catalog when it has one", async () => {
    const source = catalogFor(
      memoryCatalog([
        {
          key: "mug",
          name: "Stoneware Mug",
          brand: "Brightleaf",
          description: "",
          tags: ["drink"],
          vendorKey: "vendor-brightleaf",
          vendorName: "Brightleaf Tea House",
          slaDays: 2,
          currency: "USD",
          variants: [{ sku: "MUG-1", label: "", priceCents: 3000, available: true, imageUrl: null }],
        },
      ]),
    );
    expect(source).not.toBe(seedCatalog);
    expect((await source.products()).map((p) => p.key)).toEqual(["mug"]);
  });
});

describe("the catalog and the mailer together", () => {
  const mailer: Mailer = { send: async () => ({ messageId: null }) };
  const mug = {
    key: "mug",
    name: "Only From The Connector",
    brand: "Brightleaf",
    description: "",
    tags: ["drink"],
    vendorKey: "vendor-brightleaf",
    vendorName: "Brightleaf Tea House",
    slaDays: 2,
    currency: "USD",
    variants: [{ sku: "MUG-1", label: "", priceCents: 3000, available: true, imageUrl: null }],
  };

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("are both wired by defaultDeps", () => {
    const deps = defaultDeps({}, { mailer, catalog: memoryCatalog([]) });
    expect(deps.catalog).not.toBe(seedCatalog);
    expect(deps.channels?.has("email")).toBe(true);
  });

  it("are both used by buildApp, so passing a mailer never drops the connector's catalog", async () => {
    vi.stubEnv("DEV_AUTH", "1");
    const app = await buildApp({ catalog: memoryCatalog([mug]), mailer });
    const res = await app.inject({ method: "GET", url: "/v1/catalog/products", headers: { "x-dev-user": "user-maya", "x-gifting-team": "team-lumen-people" } });
    await app.close();
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("Only From The Connector");
  });
});
