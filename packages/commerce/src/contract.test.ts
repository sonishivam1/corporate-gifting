import { describe, expect, it } from "vitest";

import { type AccountsConnector, type CommerceConnector, connectorProblem, CONTRACT_VERSION } from "./contract";

const accounts: AccountsConnector = {
  register: async () => ({ duplicate: true }),
  findByEmail: async () => null,
  get: async () => null,
  markEmailVerified: async () => null,
  signInWithPassword: async () => null,
};
const connector = (over: Partial<CommerceConnector> = {}): CommerceConnector => ({ id: "test", contractVersion: CONTRACT_VERSION, capabilities: { signIn: "password" }, accounts, ...over });

describe("connectorProblem", () => {
  it("accepts a connector that fulfils its capabilities", () => {
    expect(connectorProblem(connector())).toBeNull();
  });

  it("refuses another contract version", () => {
    expect(connectorProblem(connector({ contractVersion: 2 as never }))).toMatch(/contract version 2/);
  });

  it("refuses a sign-in mode the connector can't do", () => {
    expect(connectorProblem(connector({ accounts: { ...accounts, signInWithPassword: undefined } }))).toMatch(/password/);
    expect(connectorProblem(connector({ capabilities: { signIn: "hosted" } }))).toMatch(/hostedSignIn/);
  });

  it("needs both platform-session methods, or neither", () => {
    expect(connectorProblem(connector({ accounts: { ...accounts, renewPlatformSession: async () => null } }))).toMatch(/both/);
  });
});
