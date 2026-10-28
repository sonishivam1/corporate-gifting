import { describe, expect, it } from "vitest";

import { isSandboxProject, loadCtConfig } from "./config";

const env = {
  CTP_PROJECT_KEY: "gifting-sandbox",
  CTP_CLIENT_ID: "client-id",
  CTP_CLIENT_SECRET: "very-secret-value",
  CTP_SCOPES: "manage_orders:gifting-sandbox  view_products:gifting-sandbox",
  CTP_AUTH_URL: "https://auth.europe-west1.gcp.commercetools.com",
  CTP_API_URL: "https://api.europe-west1.gcp.commercetools.com",
};

describe("commercetools config", () => {
  it("reads the settings and splits scopes", () => {
    const config = loadCtConfig(env);
    expect(config.scopes).toEqual(["manage_orders:gifting-sandbox", "view_products:gifting-sandbox"]);
    expect(config.storeKey).toBe("gifting");
  });

  it("names missing variables without echoing any value", () => {
    const { CTP_CLIENT_ID: _id, ...missing } = env;
    expect(() => loadCtConfig(missing)).toThrow("CTP_CLIENT_ID is not set.");
    try {
      loadCtConfig({ ...env, CTP_API_URL: "not a url" });
    } catch (err) {
      expect(String(err)).not.toContain("very-secret-value");
    }
  });
});

describe("sandbox guard", () => {
  it("allows only sandbox and dev projects", () => {
    expect(isSandboxProject("gifting-sandbox")).toBe(true);
    expect(isSandboxProject("gifting-dev")).toBe(true);
    expect(isSandboxProject("dev-gifting")).toBe(true);
    expect(isSandboxProject("gifting")).toBe(false);
    expect(isSandboxProject("gifting-prod")).toBe(false);
    expect(isSandboxProject("developer-gifting")).toBe(false);
  });
});
