"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { acceptInvitation, ApiCallError } from "@/lib/api";
import { COMPANY_COOKIE, TEAM_COOKIE } from "@/lib/dev-session";

const COOKIE = { httpOnly: true, sameSite: "lax", path: "/" } as const;

/**
 * Accepts the invitation, then opens the dashboard in the company (and team)
 * just joined. The API decides; the cookies only remember the choice.
 */
export async function acceptInvitationAction(_: { message: string } | null, form: FormData): Promise<{ message: string } | null> {
  const token = String(form.get("token") ?? "");
  let joined: { companyKey: string; teamKey: string | null };
  try {
    joined = await acceptInvitation(token);
  } catch (err) {
    if (err instanceof ApiCallError) return { message: err.message };
    return { message: "Something went wrong. Try again." };
  }
  const jar = await cookies();
  jar.set(COMPANY_COOKIE, joined.companyKey, COOKIE);
  if (joined.teamKey) jar.set(TEAM_COOKIE, joined.teamKey, COOKIE);
  else jar.delete(TEAM_COOKIE);
  revalidatePath("/", "layout");
  // Outside the try: redirect() works by throwing.
  redirect("/");
}
