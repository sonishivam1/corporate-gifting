import { describe, expect, it } from "vitest";

import { emailDomain, hasRole, isPersonalEmail, memberView, normalizeEmail, primaryRole } from "./members";

describe("work emails", () => {
  it("normalizes and splits emails", () => {
    expect(normalizeEmail("  Maya.Lin@LumenLabs.Example ")).toBe("maya.lin@lumenlabs.example");
    expect(emailDomain("Maya.Lin@LumenLabs.Example")).toBe("lumenlabs.example");
  });

  it("refuses personal mailbox domains, in any case", () => {
    expect(isPersonalEmail("someone@gmail.com")).toBe(true);
    expect(isPersonalEmail("Someone@GoogleMail.com")).toBe(true);
    expect(isPersonalEmail("someone@outlook.com")).toBe(true);
    expect(isPersonalEmail("maya@lumenlabs.example")).toBe(false);
  });
});

describe("member roles", () => {
  const member = {
    companyRoles: ["admin" as const],
    teams: [
      { key: "team-a", name: "A", roles: ["approver" as const] },
      { key: "team-b", name: "B", roles: ["sender" as const] },
    ],
  };

  it("applies company roles to every team", () => {
    expect(hasRole(member, "admin", "team-b")).toBe(true);
  });

  it("limits team roles to their team", () => {
    expect(hasRole(member, "approver", "team-a")).toBe(true);
    expect(hasRole(member, "approver", "team-b")).toBe(false);
    expect(hasRole(member, "sender")).toBe(true);
    expect(hasRole(member, "owner")).toBe(false);
  });

  it("shows the highest role, and its team when it is a team role", () => {
    expect(primaryRole(member)).toEqual({ role: "admin" });
    expect(primaryRole({ companyRoles: [], teams: member.teams })).toEqual({ role: "approver", team: "A" });
    expect(primaryRole({ companyRoles: [], teams: [] })).toBeNull();
  });

  it("rejects a member view with an unknown role", () => {
    const view = { key: "m", email: "m@x.example", firstName: null, lastName: null, status: "active", company: { key: "c", name: "C" }, companyRoles: ["superuser"], teams: [] };
    expect(memberView.safeParse(view).success).toBe(false);
  });
});
