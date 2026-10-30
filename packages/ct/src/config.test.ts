import { describe, expect, it } from "vitest";

import { isSandboxProject, loadCtApiConfig, loadCtConfig, maySetUpProject } from "./config";

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
    expect(config.importUrl).toBe("https://import.europe-west1.gcp.commercetools.com");
    expect(config.setupProjectKey).toBeUndefined();
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

describe("API client config", () => {
  const api = { CTP_API_CLIENT_ID: "api-id", CTP_API_CLIENT_SECRET: "api-secret-value", CTP_API_SCOPES: "view_published_products:gifting-sandbox" };

  it("uses the API client's own credentials and the shared project", () => {
    const config = loadCtApiConfig({ ...env, ...api });
    expect(config).toMatchObject({ clientId: "api-id", projectKey: "gifting-sandbox", scopes: ["view_published_products:gifting-sandbox"] });
  });

  it("never falls back to the setup client", () => {
    expect(() => loadCtApiConfig(env)).toThrow("CTP_API_CLIENT_ID is not set. CTP_API_CLIENT_SECRET is not set. CTP_API_SCOPES is not set.");
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

describe("setup permission", () => {
  it("allows sandbox projects and the one project named for setup", () => {
    expect(maySetUpProject({ projectKey: "gifting-sandbox" })).toBe(true);
    expect(maySetUpProject({ projectKey: "corporate-gifting" })).toBe(false);
    expect(maySetUpProject({ projectKey: "corporate-gifting", setupProjectKey: "corporate-gifting" })).toBe(true);
    expect(maySetUpProject({ projectKey: "corporate-gifting-prod", setupProjectKey: "corporate-gifting" })).toBe(false);
  });

  it("reads the named project from CTP_SETUP_PROJECT_KEY", () => {
    const config = loadCtConfig({ ...env, CTP_PROJECT_KEY: "corporate-gifting", CTP_SETUP_PROJECT_KEY: "corporate-gifting" });
    expect(maySetUpProject(config)).toBe(true);
  });
});
