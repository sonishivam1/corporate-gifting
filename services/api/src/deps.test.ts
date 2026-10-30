import { describe, expect, it } from "vitest";

import { catalogFromEnv } from "./deps";
import { seedCatalog } from "./modules/catalog/source";

describe("catalogFromEnv", () => {
  it("uses the seed catalog unless told otherwise", () => {
    expect(catalogFromEnv({})).toBe(seedCatalog);
    expect(catalogFromEnv({ CATALOG_SOURCE: "seed" })).toBe(seedCatalog);
  });

  it("refuses an unknown source", () => {
    expect(() => catalogFromEnv({ CATALOG_SOURCE: "mongo" })).toThrow("CATALOG_SOURCE must be one of seed, commercetools.");
  });

  it("needs the API's own client for commercetools, never the setup client", () => {
    const setupOnly = {
      CATALOG_SOURCE: "commercetools",
      CTP_PROJECT_KEY: "gifting-sandbox",
      CTP_CLIENT_ID: "setup-id",
      CTP_CLIENT_SECRET: "setup-secret",
      CTP_SCOPES: "manage_project:gifting-sandbox",
      CTP_AUTH_URL: "https://auth.example.com",
      CTP_API_URL: "https://api.example.com",
    };
    expect(() => catalogFromEnv(setupOnly)).toThrow("CTP_API_CLIENT_ID is not set.");
    expect(catalogFromEnv({ ...setupOnly, CTP_API_CLIENT_ID: "a", CTP_API_CLIENT_SECRET: "b", CTP_API_SCOPES: "view_published_products:gifting-sandbox" })).not.toBe(seedCatalog);
  });
});
