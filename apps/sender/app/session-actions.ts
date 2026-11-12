"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import { COMPANY_COOKIE, TEAM_COOKIE } from "@/lib/dev-session";

const COOKIE = { httpOnly: true, sameSite: "lax", path: "/" } as const;

// The API decides whether the company and team are the person's own; these only remember the choice.
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
