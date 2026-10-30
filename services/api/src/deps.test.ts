import { memoryCatalog } from "@gifting/commerce-memory";
import { describe, expect, it } from "vitest";

import { catalogFor } from "./deps";
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
