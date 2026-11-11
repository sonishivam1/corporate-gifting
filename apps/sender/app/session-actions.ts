"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import { COMPANY_COOKIE, DEV_USER_COOKIE, TEAM_COOKIE } from "@/lib/dev-session";

const COOKIE = { httpOnly: true, sameSite: "lax", path: "/" } as const;

// The API decides whether the company, team and user are the person's own; these only remember the choice.
export async function switchCompany(companyKey: string) {
  const jar = await cookies();
  jar.set(COMPANY_COOKIE, companyKey, COOKIE);
  // Their first team in that company, until they pick another.
  jar.delete(TEAM_COOKIE);
  revalidatePath("/", "layout");
}

export async function switchTeam(teamKey: string) {
  (await cookies()).set(TEAM_COOKIE, teamKey, COOKIE);
  revalidatePath("/", "layout");
}

export async function switchUser(userId: string) {
  const jar = await cookies();
  jar.set(DEV_USER_COOKIE, userId, COOKIE);
  // Their own first company and team, until they pick others.
  jar.delete(COMPANY_COOKIE);
  jar.delete(TEAM_COOKIE);
  revalidatePath("/", "layout");
}
