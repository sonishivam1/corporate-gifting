import type { Metadata } from "next";

import { getCompanyMembers, getInvitations, getWorkspace } from "@/lib/api";

import { OrganizationTabs } from "./organization-tabs";

export const metadata: Metadata = { title: "Organization & teams · Gifting" };

/**
 * The company's people, teams and pending invitations (ADR 0017). Everyone
 * sees who is in the company; owners and admins change roles, teams and
 * invitations, where the commerce platform lets the product change them
 * (the workspace's capabilities).
 */
export default async function OrganizationPage() {
  const [workspace, company] = await Promise.all([getWorkspace(), getCompanyMembers()]);
  const canManageMembers = workspace.capabilities.manageMembers && workspace.actions.includes("members:manage");
  const canManageTeams = workspace.capabilities.manageTeams && workspace.actions.includes("teams:manage");
  const invitations = canManageMembers ? await getInvitations() : [];

  return (
    <div className="grid gap-6 pt-4">
      <section className="grid gap-1">
        <h1 className="text-3xl font-semibold">{workspace.company.name}</h1>
        <p className="text-muted-foreground">
          The people in your company, their roles and teams.
          {!workspace.capabilities.manageMembers && workspace.actions.includes("members:manage")
            ? " People and roles are managed in your commerce platform, so they can't be changed here."
            : null}
        </p>
      </section>
      <OrganizationTabs
        selfId={workspace.user.id}
        company={company}
        invitations={invitations}
        canManageMembers={canManageMembers}
        canManageTeams={canManageTeams}
      />
    </div>
  );
}
