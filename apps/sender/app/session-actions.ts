"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import { DEV_TEAM_COOKIE, DEV_USER_COOKIE } from "@/lib/dev-session";

const COOKIE = { httpOnly: true, sameSite: "lax", path: "/" } as const;

// The API decides whether the user and team are real; these only remember the choice.
export async function switchTeam(teamKey: string) {
  (await cookies()).set(DEV_TEAM_COOKIE, teamKey, COOKIE);
  revalidatePath("/", "layout");
}

export async function switchUser(userId: string) {
  const jar = await cookies();
  jar.set(DEV_USER_COOKIE, userId, COOKIE);
  // Their own first team, until they pick another.
  jar.delete(DEV_TEAM_COOKIE);
  revalidatePath("/", "layout");
}
