import { describe, expect, it } from "vitest";

import { customerImport, DEMO_CUSTOMER_COUNT, demoCustomers } from "./customers";

describe("demo customers", () => {
  const customers = demoCustomers();

  it("makes the same people every time", () => {
    expect(customers).toHaveLength(DEMO_CUSTOMER_COUNT);
    expect(demoCustomers()).toEqual(customers);
  });

  it("uses unique keys and emails, on .example domains only", () => {
    expect(new Set(customers.map((c) => c.key)).size).toBe(customers.length);
    expect(new Set(customers.map((c) => c.email)).size).toBe(customers.length);
    for (const c of customers) expect(c.email, c.key).toMatch(/^[a-z.0-9]+@[a-z0-9-]+\.example$/);
  });

  it("uses phone numbers in the 555-01xx range reserved for fiction", () => {
    for (const c of customers) expect(c.phone, c.key).toMatch(/^\+1\d{3}55501\d{2}$/);
  });

  it("imports with a US shipping and billing address and no password", () => {
    const draft = customerImport(customers[0]!);
    expect(draft.authenticationMode).toBe("ExternalAuth");
    expect(draft.password).toBeUndefined();
    expect(draft.addresses?.[0]?.country).toBe("US");
    expect(draft.defaultShippingAddress).toBe(0);
    expect(draft.defaultBillingAddress).toBe(0);
    expect(draft.custom?.type.key).toBe("member-profile");
    expect(draft.custom?.fields?.status?.value).toBe("active");
  });
});
