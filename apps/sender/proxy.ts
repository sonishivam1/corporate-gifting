import { sessionTokens } from "@gifting/domain";
import { type NextRequest, NextResponse } from "next/server";

import { openSession, sealSession, SESSION_COOKIE, sessionCookieOptions } from "./lib/session";

/** Pages anyone may open. Everything else needs a session. */
const PUBLIC_PATHS = new Set(["/sign-in", "/register", "/register/check-email", "/verify-email", "/auth/callback"]);
/** Pages a signed-in person is sent past. */
const SIGNED_OUT_ONLY = new Set(["/sign-in", "/register"]);
/** Renew the access token when it has less than this left. */
const RENEW_BEFORE_MS = 5 * 60 * 1000;

const API_URL = (process.env.API_PUBLIC_URL ?? "http://localhost:4000").replace(/\/$/, "");

/**
 * Runs before every page (Next.js 16 `proxy`). It sends visitors without a
 * session to /sign-in, signed-in people past the sign-in and register pages,
 * and renews the access token here, because Server Components can't write the
 * renewed session cookie.
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const session = await openSession(request.cookies.get(SESSION_COOKIE)?.value);

  if (!session) {
    if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();
    const url = new URL("/sign-in", request.url);
    if (pathname !== "/") url.searchParams.set("returnTo", pathname + search);
    const response = NextResponse.redirect(url);
    response.cookies.delete(SESSION_COOKIE);
    return response;
  }
  if (SIGNED_OUT_ONLY.has(pathname)) return NextResponse.redirect(new URL("/", request.url));
  if (session.accessExpiresAt - Date.now() > RENEW_BEFORE_MS) return NextResponse.next();

  // Renew the access token; the API may hand back a new refresh token too.
  const renewed = await fetch(`${API_URL}/v1/auth/refresh`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refreshToken: session.refreshToken }),
    cache: "no-store",
  })
    .then(async (res) => (res.ok ? sessionTokens.safeParse(await res.json()) : null))
    .catch(() => null);
  if (!renewed?.success) {
    const response = NextResponse.redirect(new URL("/sign-in", request.url));
    response.cookies.delete(SESSION_COOKIE);
    return response;
  }
  const value = await sealSession({
    ...session,
    accessToken: renewed.data.accessToken,
    refreshToken: renewed.data.refreshToken ?? session.refreshToken,
    accessExpiresAt: renewed.data.expiresAt,
  });
  // Pages rendered for this same request read the renewed cookie too.
  request.cookies.set(SESSION_COOKIE, value);
  const response = NextResponse.next({ request: { headers: request.headers } });
  response.cookies.set(SESSION_COOKIE, value, sessionCookieOptions(session.startedAt));
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)"],
};
