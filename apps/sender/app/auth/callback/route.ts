import type { AccountView, SessionTokens } from "@gifting/domain";
import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";

import { apiPost } from "@/lib/api";
import { HOSTED_STATE_COOKIE, saveSession } from "@/lib/sign-in";

/**
 * Where the commerce platform's own sign-in page sends the person back
 * (hosted sign-in). The state must match the one this browser started with;
 * the API then checks the code with the platform and starts a session.
 */
export async function GET(request: NextRequest) {
  const failed = () => NextResponse.redirect(new URL("/sign-in?notice=sign-in-failed", request.url));
  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  const state = params.get("state");

  const store = await cookies();
  let expected: { state?: string; returnTo?: string } = {};
  try {
    expected = JSON.parse(store.get(HOSTED_STATE_COOKIE)?.value ?? "{}") as typeof expected;
  } catch {
    // A damaged cookie counts as no sign-in in progress.
  }
  store.delete(HOSTED_STATE_COOKIE);
  if (!code || !state || params.get("error") || state !== expected.state) return failed();

  const res = await apiPost<SessionTokens & { account: AccountView }>("/v1/auth/hosted/finish", { code, state });
  if (!res.ok || !(await saveSession(res.data))) return failed();
  const returnTo = expected.returnTo?.startsWith("/") && !expected.returnTo.startsWith("//") ? expected.returnTo : "/";
  return NextResponse.redirect(new URL(returnTo, request.url));
}
