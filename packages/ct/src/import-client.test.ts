import { describe, expect, it } from "vitest";

import { batches, importRequests } from "./import-client";

describe("import requests", () => {
  it("split resources into batches of at most 20", () => {
    expect(batches(Array.from({ length: 45 }, (_, i) => i)).map((b) => b.length)).toEqual([20, 20, 5]);
  });

  it("wrap each batch in a request of its type", () => {
    const resources = Array.from({ length: 21 }, (_, i) => ({ key: `k${i}`, sku: `S${i}`, quantityOnStock: 1 }));
    const requests = importRequests("inventory", resources);
    expect(requests.map((r) => [r.type, r.resources.length])).toEqual([["inventory", 20], ["inventory", 1]]);
  });
});
