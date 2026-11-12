import "server-only";

import { cookies } from "next/headers";

/**
 * The company and team the dashboard works in (ADR 0016). They live in
 * cookies and reach the API as headers. The API checks them against the
 * signed-in person's memberships and refuses ones they don't hold (404, and
 * the layout then forgets them through /workspace/reset).
 */
export const COMPANY_COOKIE = "gifting_company";
export const TEAM_COOKIE = "gifting_team";

export async function workspaceHeaders(): Promise<Record<string, string>> {
  const jar = await cookies();
  const company = jar.get(COMPANY_COOKIE)?.value;
  const team = jar.get(TEAM_COOKIE)?.value;
  return {
    ...(company ? { "x-gifting-company": company } : {}),
    ...(team ? { "x-gifting-team": team } : {}),
  };
}
