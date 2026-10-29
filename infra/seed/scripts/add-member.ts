// pnpm member:add -- --email you@company.com --company company-lumen-labs \
//   [--team team-lumen-people] --role owner|admin|approver|sender \
//   [--first-name Ada --last-name Lovelace] [--company-name "Your Company"]
//
// Adds a real person as a member of a company in the commercetools project
// from .env, so they can sign in before invitations exist (M1 sign-in plan,
// phase A). Creates the customer if needed (status "invited"; their first
// sign-in makes it "active") and adds them to the company or team with the
// role. Work emails only. Owners and admins join the company and reach every
// team; approvers and senders join one team.
//
// --company-name creates the company when no unit has that key yet: a Company
// unit in the gifting store, its email domain taken from --email, and one
// team, "General" (key `<company>-general`). Ops do this from phase B.
import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";

import { createCtApi, isNotFound, loadCtConfig, maySetUpProject, NOT_SETUP_PROJECT_MESSAGE } from "@gifting/ct";
import { emailDomain, isPersonalEmail, MEMBER_ROLES, type MemberRole, normalizeEmail } from "@gifting/domain";
import { AppError, createLogger } from "@gifting/logger";
import { z } from "zod";

const log = createLogger("member:add");

const argsSchema = z
  .object({
    email: z.email({ error: "--email must be an email address." }).transform(normalizeEmail),
    company: z.string({ error: "--company is not set." }).min(1),
    team: z.string().optional(),
    role: z.enum(MEMBER_ROLES, { error: `--role must be one of ${MEMBER_ROLES.join(", ")}.` }),
    "first-name": z.string().optional(),
    "last-name": z.string().optional(),
    "company-name": z.string().min(1).optional(),
  })
  .refine((a) => !isPersonalEmail(a.email), { error: "Members join with a work email; personal domains are refused." })
  .refine((a) => a.role === "owner" || a.role === "admin" || a.team, { error: "Approvers and senders need --team." });

const companyWide = (role: MemberRole) => role === "owner" || role === "admin";

try {
  const { values } = parseArgs({
    // Some shells pass pnpm's `--` separator through; it isn't an argument.
    args: process.argv.slice(2).filter((arg) => arg !== "--"),
    options: {
      email: { type: "string" },
      company: { type: "string" },
      team: { type: "string" },
      role: { type: "string" },
      "first-name": { type: "string" },
      "last-name": { type: "string" },
      "company-name": { type: "string" },
    },
  });
  const parsed = argsSchema.safeParse(values);
  if (!parsed.success) throw new AppError("invalid_args", parsed.error.issues.map((i) => i.message).join(" "));
  const args = parsed.data;

  const config = loadCtConfig();
  if (!maySetUpProject(config)) throw new AppError("not_sandbox", NOT_SETUP_PROJECT_MESSAGE);
  const api = createCtApi(config);

  // The unit the member joins: the company for owners and admins, else the team.
  let company = await api
    .businessUnits()
    .withKey({ key: args.company })
    .get()
    .execute()
    .then((r) => r.body)
    .catch((err: unknown) => {
      if (isNotFound(err)) return null;
      throw err;
    });
  if (!company) {
    if (!args["company-name"]) {
      const companies = (await api.businessUnits().get({ queryArgs: { where: `unitType = "Company"`, limit: 100, sort: ["key asc"] } }).execute()).body.results.map((u) => u.key);
      throw new AppError("company_not_found", `No company with the key "${args.company}". Companies: ${companies.join(", ")}. To create it, add --company-name "Its Name".`);
    }
    company = (
      await api
        .businessUnits()
        .post({
          body: {
            unitType: "Company",
            key: args.company,
            name: args["company-name"],
            contactEmail: args.email,
            stores: [{ typeId: "store", key: "gifting" }],
            storeMode: "Explicit",
            custom: { type: { typeId: "type", key: "company-settings" }, fields: { emailDomains: [emailDomain(args.email)], retentionDays: 365, allowOverage: false } },
          },
        })
        .execute()
    ).body;
    log.info({ companyKey: company.key }, "company created");
    const teamKey = `${args.company}-general`;
    await api
      .businessUnits()
      .post({
        body: {
          unitType: "Division",
          key: teamKey,
          name: `${args["company-name"]} · General`,
          parentUnit: { typeId: "business-unit", key: company.key },
          custom: { type: { typeId: "type", key: "team-settings" }, fields: { approvalThresholdCents: 50_000, approverIds: [] } },
        },
      })
      .execute();
    log.info({ teamKey }, "team created");
  }
  if (company.unitType !== "Company") throw new AppError("not_a_company", `${args.company} is not a company unit.`);
  let unitKey = company.key;
  if (!companyWide(args.role)) {
    const team = (await api.businessUnits().withKey({ key: args.team! }).get().execute()).body;
    if (team.unitType !== "Division" || team.topLevelUnit.key !== company.key) throw new AppError("not_a_team", `${args.team} is not a team of ${company.key}.`);
    unitKey = team.key;
  }

  const found = (await api.customers().get({ queryArgs: { where: `lowercaseEmail = "${args.email}"`, limit: 1 } }).execute()).body.results[0];
  const customer =
    found ??
    (
      await api
        .customers()
        .post({
          body: {
            key: `member-${randomUUID()}`,
            email: args.email,
            ...(args["first-name"] ? { firstName: args["first-name"] } : {}),
            ...(args["last-name"] ? { lastName: args["last-name"] } : {}),
            authenticationMode: "ExternalAuth",
            custom: { type: { typeId: "type", key: "member-profile" }, fields: { status: "invited", invitedAt: new Date().toISOString(), invitedBy: "member:add" } },
          },
        })
        .execute()
    ).body.customer;
  log.info({ customerKey: customer.key, created: !found }, found ? "customer exists" : "customer created");

  const unit = (await api.businessUnits().withKey({ key: unitKey }).get().execute()).body;
  if (unit.associates.some((a) => a.customer.id === customer.id)) {
    log.info({ unitKey, customerKey: customer.key }, "already a member of this unit, unchanged");
  } else {
    await api
      .businessUnits()
      .withKey({ key: unitKey })
      .post({
        body: {
          version: unit.version,
          actions: [
            {
              action: "addAssociate",
              associate: {
                customer: { typeId: "customer", id: customer.id },
                associateRoleAssignments: [{ associateRole: { typeId: "associate-role", key: args.role }, inheritance: companyWide(args.role) ? "Enabled" : "Disabled" }],
              },
            },
          ],
        },
      })
      .execute();
    log.info({ unitKey, customerKey: customer.key, role: args.role }, "member added");
  }
} catch (err) {
  log.error({ err }, "member:add failed");
  process.exitCode = 1;
}
