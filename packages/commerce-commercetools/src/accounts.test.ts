import { describe, expect, it } from "vitest";

import { loadSignInClientConfig, signInScopeProblem } from "./accounts";

describe("the sign-in API client", () => {
  it("may hold only the customer's own scopes", () => {
    expect(signInScopeProblem("manage_my_profile:corporate-gifting")).toBeNull();
    expect(signInScopeProblem("manage_my_profile:p view_published_products:p")).toBeNull();
    expect(signInScopeProblem("manage_project:corporate-gifting")).toMatch(/manage_project/);
    expect(signInScopeProblem("manage_my_profile:p manage_customers:p")).toMatch(/manage_customers/);
  });

  it("must be configured, and the message names no value", () => {
    expect(() => loadSignInClientConfig({ CTP_SIGNIN_CLIENT_ID: "id-only" })).toThrow(/CTP_SIGNIN_CLIENT_SECRET/);
    expect(() => loadSignInClientConfig({ CTP_SIGNIN_CLIENT_ID: "id-only" })).not.toThrow(/id-only/);
    expect(loadSignInClientConfig({ CTP_SIGNIN_CLIENT_ID: " a ", CTP_SIGNIN_CLIENT_SECRET: "b" })).toEqual({ clientId: "a", clientSecret: "b" });
  });
});
