import { memoryOrganizations, type MemoryOrganizations } from "@gifting/commerce-memory";
import type { AccountView } from "@gifting/domain";
import { createLogger } from "@gifting/logger";
import { demoCompany } from "@gifting/seed";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { ApiError } from "../../src/http/errors";
import type { Email } from "../../src/mail/mailer";
import { type OrgDirectory, orgDirectory } from "../../src/modules/accounts/org";
import type { AccountsService } from "../../src/modules/accounts/service";
import { DANA, type Harness, MAYA, ROWAN, startHarness, THEO } from "./harness";

// ADR 0017 on the memory connector with every write part: what a manager may
// change, what is refused, and invitations from email to accepted role.
// Everyone here is fictional.

const LUMEN = demoCompany.key;
const emailOf = (name: string) => `${name.split(" ")[0]!.toLowerCase()}@lumenlabs.example`;

function organizations(): MemoryOrganizations {
  return {
    companies: [
      { key: LUMEN, name: demoCompany.name, teams: demoCompany.teams.map((t) => ({ ...t })) },
      { key: "company-harbor-finch", name: "Harbor & Finch", teams: [{ key: "team-harbor-people", name: "People", approvalThresholdCents: null }] },
    ],
    members: [
      ...demoCompany.members.map((m) => ({
        id: m.id,
        name: m.name,
        email: emailOf(m.name),
        memberships: m.memberships.map((x) => ({ companyKey: LUMEN, ...x })),
      })),
      { id: "user-hale", name: "Hale Moreno", email: "hale@harborfinch.example", memberships: [{ companyKey: "company-harbor-finch", role: "owner" as const }] },
    ],
  };
}

/** People who can sign in: bearer token → account. Accepting an invitation and the profile need a signed-in account. */
const ACCOUNTS: Record<string, AccountView> = {
  "tok-nia": { id: "cust-nia", email: "nia.park@lumenlabs.example", firstName: "Nia", lastName: "Park", companyName: null },
  "tok-otto": { id: "cust-otto", email: "otto@elsewhere.example", firstName: "Otto", lastName: "Reyes", companyName: null },
};
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
const NIA = bearer("tok-nia");
const OTTO = bearer("tok-otto");

function fakeAccounts() {
  const people = structuredClone(ACCOUNTS);
  const service = {
    async authenticate(token: string) {
      const account = people[token];
      if (!account) throw new ApiError(401, "unauthenticated", "Sign in to continue.");
      return { ...account };
    },
    isOps: () => false,
    canEditName: true,
    async updateName(id: string, name: { firstName: string; lastName: string }) {
      const account = Object.values(people).find((a) => a.id === id)!;
      Object.assign(account, name);
      return { ...account };
    },
  };
  return service as unknown as AccountsService;
}

/** An outbox the tests read; `failNext` makes the next send throw, as a provider outage would. */
function capturingMailer() {
  const sent: Email[] = [];
  let fail = false;
  return {
    sent,
    failNext: () => void (fail = true),
    mailer: {
      async send(email: Email) {
        if (fail) {
          fail = false;
          throw new Error("mail provider down");
        }
        sent.push(email);
        return { messageId: `m-${sent.length}` };
      },
    },
  };
}

const linkTokenOf = (email: Email) => /\/invitations\/([A-Za-z0-9_-]+)/.exec(JSON.stringify(email))![1]!;

let h: Harness;
let current: OrgDirectory;
const outbox = capturingMailer();
const logs: string[] = [];

beforeAll(async () => {
  // Each test starts from the same companies: the directory the app holds forwards to a fresh one.
  const org = new Proxy({} as OrgDirectory, { get: (_, key) => current[key as keyof OrgDirectory] });
  current = fresh();
  h = await startHarness(
    { org, mailer: outbox.mailer, senderBaseUrl: "http://app.test" },
    { accounts: fakeAccounts(), logger: createLogger("api-test", {}, { level: "info", destination: { write: (line: string) => void logs.push(line) } }) },
  );
});

beforeEach(async () => {
  current = fresh();
  outbox.sent.length = 0;
  await h.c.invitations.deleteMany({});
});

afterAll(async () => {
  await h?.close();
});

function fresh(): OrgDirectory {
  return orgDirectory(
    memoryOrganizations(organizations(), {
      writes: { members: true, teams: true },
      person: (id) => {
        const account = Object.values(ACCOUNTS).find((a) => a.id === id);
        return account ? { name: `${account.firstName} ${account.lastName}`, email: account.email } : null;
      },
    }),
    { ttlMs: 0 },
  );
}

const listAs = (headers: Record<string, string>) => h.app.inject({ method: "GET", url: "/v1/company/members", headers });
const rolesOf = (list: { members: { id: string; memberships: { role: string; teamKey: string | null }[] }[] }, id: string) =>
  list.members.find((m) => m.id === id)?.memberships ?? null;
const addRole = (headers: Record<string, string>, id: string, payload: Record<string, unknown>) =>
  h.app.inject({ method: "POST", url: `/v1/company/members/${id}/roles`, headers, payload });
const removeRole = (headers: Record<string, string>, id: string, role: string, teamKey?: string) =>
  h.app.inject({ method: "DELETE", url: `/v1/company/members/${id}/roles?role=${role}${teamKey ? `&teamKey=${teamKey}` : ""}`, headers });
const errorOf = (res: { statusCode: number; json: () => { error?: { code: string } } }) => [res.statusCode, res.json().error?.code];

describe("members", () => {
  it("lists the company's people; only managers see emails and roles they can give", async () => {
    const asOwner = (await listAs(DANA)).json();
    expect(asOwner.members.map((m: { id: string }) => m.id).sort()).toEqual(["user-dana", "user-imani", "user-maya", "user-rowan", "user-theo"]);
    expect(asOwner.members.find((m: { id: string }) => m.id === "user-maya").email).toBe("maya@lumenlabs.example");
    expect(asOwner.grantable).toEqual(["owner", "admin", "approver", "sender"]);
    expect((await listAs(THEO)).json().grantable).toEqual(["admin", "approver", "sender"]);
    const asSender = (await listAs(MAYA)).json();
    expect(asSender.members.every((m: { email: string | null }) => m.email === null)).toBe(true);
    expect(asSender.grantable).toEqual([]);
  });

  it("an owner gives a role and takes it away again", async () => {
    const added = await addRole(DANA, "user-maya", { role: "approver", teamKey: "team-lumen-sales" });
    expect(added.statusCode).toBe(200);
    expect(rolesOf(added.json(), "user-maya")).toContainEqual({ role: "approver", teamKey: "team-lumen-sales" });
    const removed = await removeRole(DANA, "user-maya", "approver", "team-lumen-sales");
    expect(removed.statusCode).toBe(200);
    expect(rolesOf(removed.json(), "user-maya")).not.toContainEqual({ role: "approver", teamKey: "team-lumen-sales" });
  });

  it("refuses a role of the wrong shape", async () => {
    expect(errorOf(await addRole(DANA, "user-maya", { role: "admin", teamKey: "team-lumen-people" }))).toEqual([400, "invalid_role"]);
    expect(errorOf(await addRole(DANA, "user-maya", { role: "sender" }))).toEqual([400, "invalid_role"]);
  });

  it("an admin can't make an owner, or change or remove one", async () => {
    expect(errorOf(await addRole(THEO, "user-maya", { role: "owner" }))).toEqual([403, "role_not_allowed"]);
    expect(errorOf(await removeRole(THEO, "user-dana", "owner"))).toEqual([403, "role_not_allowed"]);
    expect(errorOf(await h.app.inject({ method: "DELETE", url: "/v1/company/members/user-dana", headers: THEO }))).toEqual([403, "role_not_allowed"]);
    // An admin still manages everyone else.
    expect((await addRole(THEO, "user-rowan", { role: "sender", teamKey: "team-lumen-people" })).statusCode).toBe(200);
  });

  it("nobody changes their own roles", async () => {
    expect(errorOf(await addRole(DANA, "user-dana", { role: "admin" }))).toEqual([403, "own_roles"]);
    expect(errorOf(await removeRole(DANA, "user-dana", "owner"))).toEqual([403, "own_roles"]);
    expect(errorOf(await h.app.inject({ method: "DELETE", url: "/v1/company/members/user-theo", headers: THEO }))).toEqual([403, "own_roles"]);
  });

  it("a second owner may take the first's role, and then the company keeps its one owner", async () => {
    expect((await addRole(DANA, "user-theo", { role: "owner" })).statusCode).toBe(200);
    const removed = await removeRole(THEO, "user-dana", "owner");
    expect(removed.statusCode).toBe(200);
    expect(rolesOf(removed.json(), "user-dana")).toBeNull();
  });

  it("senders and approvers can't manage people or teams", async () => {
    expect(errorOf(await addRole(MAYA, "user-rowan", { role: "sender", teamKey: "team-lumen-people" }))).toEqual([403, "forbidden"]);
    expect(errorOf(await addRole(ROWAN, "user-maya", { role: "approver", teamKey: "team-lumen-people" }))).toEqual([403, "forbidden"]);
    expect(errorOf(await h.app.inject({ method: "POST", url: "/v1/company/teams", headers: MAYA, payload: { name: "Ops" } }))).toEqual([403, "forbidden"]);
    expect(errorOf(await h.app.inject({ method: "GET", url: "/v1/company/invitations", headers: ROWAN }))).toEqual([403, "forbidden"]);
  });

  it("another company's person or team is not found", async () => {
    expect(errorOf(await addRole(DANA, "user-hale", { role: "admin" }))).toEqual([404, "not_found"]);
    expect(errorOf(await addRole(DANA, "user-maya", { role: "sender", teamKey: "team-harbor-people" }))).toEqual([404, "not_found"]);
    expect(errorOf(await h.app.inject({ method: "DELETE", url: "/v1/company/members/user-hale", headers: DANA }))).toEqual([404, "not_found"]);
  });

  it("a role taken away stops the very next write", async () => {
    expect((await addRole(DANA, "user-rowan", { role: "admin" })).statusCode).toBe(200);
    expect((await h.app.inject({ method: "POST", url: "/v1/company/teams", headers: ROWAN, payload: { name: "Ops" } })).statusCode).toBe(200);
    expect((await removeRole(DANA, "user-rowan", "admin")).statusCode).toBe(200);
    expect(errorOf(await h.app.inject({ method: "POST", url: "/v1/company/teams", headers: ROWAN, payload: { name: "Ops again" } }))).toEqual([403, "forbidden"]);
  });

  it("removes someone from the company: every role they hold there", async () => {
    const res = await h.app.inject({ method: "DELETE", url: "/v1/company/members/user-maya", headers: DANA });
    expect(res.statusCode).toBe(200);
    expect(rolesOf(res.json(), "user-maya")).toBeNull();
  });
});

describe("teams", () => {
  it("creates a team with a key from its name, and numbers a key already taken", async () => {
    const first = await h.app.inject({ method: "POST", url: "/v1/company/teams", headers: DANA, payload: { name: "Customer Success" } });
    expect(first.json()).toEqual({ key: "team-lumen-labs-customer-success", name: "Customer Success" });
    const second = await h.app.inject({ method: "POST", url: "/v1/company/teams", headers: THEO, payload: { name: "Customer success" } });
    expect(second.json()).toEqual({ key: "team-lumen-labs-customer-success-2", name: "Customer success" });
    expect((await listAs(DANA)).json().teams.map((t: { key: string }) => t.key)).toContain("team-lumen-labs-customer-success-2");
    // The new team takes roles at once.
    expect((await addRole(DANA, "user-maya", { role: "sender", teamKey: "team-lumen-labs-customer-success" })).statusCode).toBe(200);
  });

  it("renames a team of the company, and nothing else", async () => {
    const renamed = await h.app.inject({ method: "PATCH", url: "/v1/company/teams/team-lumen-sales", headers: DANA, payload: { name: "Revenue" } });
    expect(renamed.json()).toEqual({ key: "team-lumen-sales", name: "Revenue" });
    expect(errorOf(await h.app.inject({ method: "PATCH", url: "/v1/company/teams/team-harbor-people", headers: DANA, payload: { name: "Ours now" } }))).toEqual([404, "not_found"]);
    expect(errorOf(await h.app.inject({ method: "PATCH", url: "/v1/company/teams/team-nope", headers: DANA, payload: { name: "Nope" } }))).toEqual([404, "not_found"]);
    expect((await h.app.inject({ method: "PATCH", url: "/v1/company/teams/team-lumen-sales", headers: DANA, payload: { name: "" } })).statusCode).toBe(400);
  });
});

describe("invitations", () => {
  const invite = (headers: Record<string, string>, payload: Record<string, unknown>) => h.app.inject({ method: "POST", url: "/v1/company/invitations", headers, payload });
  const preview = (token: string) => h.app.inject({ method: "GET", url: `/v1/invitations/${token}` });
  const accept = (token: string, headers: Record<string, string>) => h.app.inject({ method: "POST", url: `/v1/invitations/${token}/accept`, headers });
  const NIA_AS_SENDER = { email: "Nia.Park@LumenLabs.example", role: "sender", teamKey: "team-lumen-sales" };

  it("emails a link, keeps only its hash, and logs no address or link", async () => {
    logs.length = 0;
    const res = await invite(DANA, NIA_AS_SENDER);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ email: "nia.park@lumenlabs.example", role: "sender", teamKey: "team-lumen-sales", teamName: "Sales", invitedByName: "Dana Okafor" });
    expect(outbox.sent).toHaveLength(1);
    expect(outbox.sent[0]!.to).toBe("nia.park@lumenlabs.example");
    const token = linkTokenOf(outbox.sent[0]!);
    expect(JSON.stringify(outbox.sent[0])).toContain(`http://app.test/invitations/${token}`);

    const stored = await h.c.invitations.findOne({});
    expect(stored).toMatchObject({ status: "pending", companyKey: LUMEN, invitedBy: "user-dana" });
    expect(JSON.stringify(stored)).not.toContain(token);
    expect(logs.join("\n")).toContain("org.invitation_sent");
    expect(logs.join("\n")).not.toContain(token);
    expect(logs.join("\n").toLowerCase()).not.toContain("nia.park");

    const listed = await h.app.inject({ method: "GET", url: "/v1/company/invitations", headers: THEO });
    expect(listed.json().invitations.map((i: { id: string }) => i.id)).toEqual([stored!._id]);
  });

  it("the link shows the company, role and team, and is accepted once, by the invited address", async () => {
    await invite(DANA, NIA_AS_SENDER);
    const token = linkTokenOf(outbox.sent[0]!);
    const shown = await preview(token);
    expect(shown.json()).toEqual({ companyName: "Lumen Labs", role: "sender", teamName: "Sales", expiresAt: expect.any(String) });

    expect(errorOf(await accept(token, {}))).toEqual([401, "unauthenticated"]);
    expect(errorOf(await accept(token, OTTO))).toEqual([403, "invitation_wrong_account"]);
    expect((await h.c.invitations.findOne({}))!.status).toBe("pending");

    const accepted = await accept(token, NIA);
    expect(accepted.json()).toEqual({ companyKey: LUMEN, teamKey: "team-lumen-sales", role: "sender" });
    expect(await h.c.invitations.findOne({})).toMatchObject({ status: "accepted", acceptedBy: "cust-nia" });
    // Nia now works in the company, signed in as herself.
    const list = await listAs(NIA);
    expect(list.statusCode).toBe(200);
    expect(rolesOf(list.json(), "cust-nia")).toEqual([{ role: "sender", teamKey: "team-lumen-sales" }]);

    expect(errorOf(await accept(token, NIA))).toEqual([409, "invitation_used"]);
    expect(errorOf(await preview(token))).toEqual([404, "invitation_not_found"]);
  });

  it("two accepts at once: one wins, the other is told it was used", async () => {
    await invite(DANA, NIA_AS_SENDER);
    const token = linkTokenOf(outbox.sent[0]!);
    const results = await Promise.all([accept(token, NIA), accept(token, NIA)]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409]);
  });

  it("an expired or withdrawn link doesn't work", async () => {
    await invite(DANA, NIA_AS_SENDER);
    const expired = linkTokenOf(outbox.sent[0]!);
    await h.c.invitations.updateOne({}, { $set: { expiresAt: new Date("2026-10-01T00:00:00Z") } });
    expect(errorOf(await preview(expired))).toEqual([404, "invitation_not_found"]);
    expect(errorOf(await accept(expired, NIA))).toEqual([404, "invitation_not_found"]);

    await h.c.invitations.deleteMany({});
    await invite(DANA, NIA_AS_SENDER);
    const withdrawn = linkTokenOf(outbox.sent[1]!);
    const id = (await h.c.invitations.findOne({}))!._id;
    expect((await h.app.inject({ method: "DELETE", url: `/v1/company/invitations/${id}`, headers: THEO })).statusCode).toBe(200);
    expect(errorOf(await accept(withdrawn, NIA))).toEqual([404, "invitation_not_found"]);
    expect(rolesOf((await listAs(DANA)).json(), "cust-nia")).toBeNull();
  });

  it("resending sends a new link and the old one stops working", async () => {
    await invite(DANA, NIA_AS_SENDER);
    const old = linkTokenOf(outbox.sent[0]!);
    const id = (await h.c.invitations.findOne({}))!._id;
    expect((await h.app.inject({ method: "POST", url: `/v1/company/invitations/${id}/resend`, headers: DANA })).statusCode).toBe(200);
    const renewed = linkTokenOf(outbox.sent[1]!);
    expect(renewed).not.toBe(old);
    expect(errorOf(await preview(old))).toEqual([404, "invitation_not_found"]);
    expect((await preview(renewed)).statusCode).toBe(200);
  });

  it("refuses a second pending invitation for the same role", async () => {
    expect((await invite(DANA, NIA_AS_SENDER)).statusCode).toBe(200);
    expect(errorOf(await invite(THEO, { ...NIA_AS_SENDER, email: "nia.park@lumenlabs.example" }))).toEqual([409, "already_invited"]);
    // Another role is another invitation.
    expect((await invite(DANA, { ...NIA_AS_SENDER, role: "approver" })).statusCode).toBe(200);
  });

  it("invites only to roles and teams the caller may give, in their own company", async () => {
    expect(errorOf(await invite(THEO, { email: "kit@lumenlabs.example", role: "owner", teamKey: null }))).toEqual([403, "role_not_allowed"]);
    expect(errorOf(await invite(MAYA, { email: "kit@lumenlabs.example", role: "sender", teamKey: "team-lumen-people" }))).toEqual([403, "forbidden"]);
    expect(errorOf(await invite(DANA, { email: "kit@lumenlabs.example", role: "sender", teamKey: "team-harbor-people" }))).toEqual([404, "not_found"]);
    expect(errorOf(await invite(DANA, { email: "kit@lumenlabs.example", role: "admin", teamKey: "team-lumen-people" }))).toEqual([400, "invalid_role"]);
    expect(await h.c.invitations.countDocuments({})).toBe(0);
  });

  it("another company's invitation is not found", async () => {
    await invite(DANA, NIA_AS_SENDER);
    const id = (await h.c.invitations.findOne({}))!._id;
    await h.c.invitations.updateOne({ _id: id }, { $set: { companyKey: "company-harbor-finch", teamKey: "team-harbor-people" } });
    expect(errorOf(await h.app.inject({ method: "DELETE", url: `/v1/company/invitations/${id}`, headers: DANA }))).toEqual([404, "not_found"]);
    expect(errorOf(await h.app.inject({ method: "POST", url: `/v1/company/invitations/${id}/resend`, headers: DANA }))).toEqual([404, "not_found"]);
    expect((await h.app.inject({ method: "GET", url: "/v1/company/invitations", headers: DANA })).json().invitations).toEqual([]);
  });

  it("an invitation whose email never left is taken back, so it can be sent again", async () => {
    outbox.failNext();
    expect((await invite(DANA, NIA_AS_SENDER)).statusCode).toBe(500);
    expect(await h.c.invitations.countDocuments({})).toBe(0);
    expect((await invite(DANA, NIA_AS_SENDER)).statusCode).toBe(200);
  });
});

describe("profile", () => {
  const rename = (payload: Record<string, unknown>, headers: Record<string, string> = NIA) => h.app.inject({ method: "PATCH", url: "/v1/me", headers, payload });

  it("changes the signed-in person's name, and says the platform allows it", async () => {
    expect((await h.app.inject({ method: "GET", url: "/v1/me", headers: NIA })).json().canEditName).toBe(true);
    const res = await rename({ firstName: "Nia", lastName: "Park-Lee" });
    expect(res.json()).toMatchObject({ id: "cust-nia", firstName: "Nia", lastName: "Park-Lee", canEditName: true });
  });

  it("refuses an empty or overlong name, and anyone signed out", async () => {
    expect((await rename({ firstName: "", lastName: "Park" })).statusCode).toBe(400);
    expect((await rename({ firstName: "Nia", lastName: "x".repeat(101) })).statusCode).toBe(400);
    expect(errorOf(await rename({ firstName: "Nia", lastName: "Park" }, {}))).toEqual([401, "unauthenticated"]);
  });
});

describe("what the platform supports", () => {
  it("the workspace tells the app which parts it can show", async () => {
    const res = await h.app.inject({ method: "GET", url: "/v1/workspace", headers: DANA });
    expect(res.json().capabilities).toEqual({ manageMembers: true, manageTeams: true, editName: true });
  });

  describe("on a platform without organization writes", () => {
    let bare: Harness;
    beforeAll(async () => {
      bare = await startHarness();
    });
    afterAll(async () => {
      await bare?.close();
    });

    it("reads members, answers 501 to every change, and says so in the workspace", async () => {
      expect((await bare.app.inject({ method: "GET", url: "/v1/workspace", headers: DANA })).json().capabilities).toEqual({ manageMembers: false, manageTeams: false, editName: false });
      expect((await bare.app.inject({ method: "GET", url: "/v1/company/members", headers: DANA })).statusCode).toBe(200);
      const changes = [
        bare.app.inject({ method: "POST", url: "/v1/company/members/user-maya/roles", headers: DANA, payload: { role: "approver", teamKey: "team-lumen-sales" } }),
        bare.app.inject({ method: "DELETE", url: "/v1/company/members/user-maya", headers: DANA }),
        bare.app.inject({ method: "POST", url: "/v1/company/teams", headers: DANA, payload: { name: "Ops" } }),
        bare.app.inject({ method: "PATCH", url: "/v1/company/teams/team-lumen-sales", headers: DANA, payload: { name: "Revenue" } }),
        bare.app.inject({ method: "POST", url: "/v1/company/invitations", headers: DANA, payload: { email: "kit@lumenlabs.example", role: "sender", teamKey: "team-lumen-people" } }),
      ];
      for (const res of await Promise.all(changes)) expect(errorOf(res)).toEqual([501, "not_supported"]);
    });
  });
});
