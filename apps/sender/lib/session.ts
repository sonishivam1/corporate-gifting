import "server-only";

import { cookies } from "next/headers";

/**
 * Development sign-in until the identity provider lands in M1 (ADR 0009).
 * The "Viewing as" user and the chosen team live in cookies and reach the
 * API as headers; the API ignores them unless DEV_AUTH=1 outside production.
 */
export const DEV_USER_COOKIE = "gifting_dev_user";
export const DEV_TEAM_COOKIE = "gifting_dev_team";

export async function devSessionHeaders(): Promise<Record<string, string>> {
  const jar = await cookies();
  const user = jar.get(DEV_USER_COOKIE)?.value;
  const team = jar.get(DEV_TEAM_COOKIE)?.value;
  return { ...(user ? { "x-dev-user": user } : {}), ...(team ? { "x-dev-team": team } : {}) };
}
