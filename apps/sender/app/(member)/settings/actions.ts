"use server";

import type { AccountView, CompanyMembersView, InvitationView, InviteInput, NameInput, RoleChangeInput, TeamView } from "@gifting/domain";
import { revalidatePath } from "next/cache";

import {
  addMemberRole,
  ApiCallError,
  createTeam,
  removeMember,
  removeMemberRole,
  renameTeam,
  resendInvitation,
  revokeInvitation,
  sendInvitation,
  updateMyName,
} from "@/lib/api";

import type { ActionResult } from "../campaigns/actions";

/**
 * Changes to the person's profile and their company (ADR 0017). The API
 * decides who may do what; these only pass the request on and refresh the
 * pages that show the result.
 */
async function attempt<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    revalidatePath("/", "layout");
    return { ok: true, data };
  } catch (err) {
    if (err instanceof ApiCallError) return { ok: false, code: err.code, message: err.message };
    return { ok: false, code: "unexpected", message: "Something went wrong. Try again." };
  }
}

export const updateNameAction = async (input: NameInput): Promise<ActionResult<AccountView>> => attempt(() => updateMyName(input));

export const addRoleAction = async (customerId: string, input: RoleChangeInput): Promise<ActionResult<CompanyMembersView>> =>
  attempt(() => addMemberRole(customerId, input));

export const removeRoleAction = async (customerId: string, input: RoleChangeInput): Promise<ActionResult<CompanyMembersView>> =>
  attempt(() => removeMemberRole(customerId, input));

export const removeMemberAction = async (customerId: string): Promise<ActionResult<CompanyMembersView>> => attempt(() => removeMember(customerId));

export const createTeamAction = async (name: string): Promise<ActionResult<TeamView>> => attempt(() => createTeam(name));

export const renameTeamAction = async (teamKey: string, name: string): Promise<ActionResult<TeamView>> => attempt(() => renameTeam(teamKey, name));

export const inviteAction = async (input: InviteInput): Promise<ActionResult<InvitationView>> => attempt(() => sendInvitation(input));

export const resendInvitationAction = async (id: string): Promise<ActionResult<{ status: "ok" }>> => attempt(() => resendInvitation(id));

export const revokeInvitationAction = async (id: string): Promise<ActionResult<{ status: "ok" }>> => attempt(() => revokeInvitation(id));
