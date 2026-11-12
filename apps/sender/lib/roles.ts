import type { MemberRole } from "@gifting/domain";

/** How roles read in the dashboard (ADR 0016): owners and admins on the whole company, approvers and senders on one team. */
export const ROLE_LABEL: Record<MemberRole, string> = { owner: "Owner", admin: "Admin", approver: "Approver", sender: "Sender" };

export const ROLE_HINT: Record<MemberRole, string> = {
  owner: "Everything, on every team, including other owners",
  admin: "Manages people, teams and budgets on every team",
  approver: "Approves sends over the team's limit",
  sender: "Sends gifts from the team's budget",
};

export const isCompanyRole = (role: MemberRole) => role === "owner" || role === "admin";

/** "Admin" for a company role; "Sender · Sales" for a team role. */
export function roleLabel(m: { role: MemberRole; teamKey: string | null }, teamNames: ReadonlyMap<string, string>): string {
  return m.teamKey ? `${ROLE_LABEL[m.role]} · ${teamNames.get(m.teamKey) ?? m.teamKey}` : ROLE_LABEL[m.role];
}
