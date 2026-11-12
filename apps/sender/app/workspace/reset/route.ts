import { type NextRequest, NextResponse } from "next/server";

import { COMPANY_COOKIE, TEAM_COOKIE } from "@/lib/dev-session";

/**
 * Forgets the remembered company and team, then opens the dashboard again.
 * The layout sends people here when the API refuses the remembered ones as
 * no longer theirs (a role removed, say): the API then picks their first
 * company and team. Server Components can't change cookies; a route handler can.
 */
export function GET(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/", request.url));
  response.cookies.delete(COMPANY_COOKIE);
  response.cookies.delete(TEAM_COOKIE);
  return response;
}
