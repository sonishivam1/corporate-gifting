import "server-only";

import type { SessionTokens } from "@gifting/domain";
import { cookies } from "next/headers";

import { sealSession, SESSION_COOKIE, sessionCookieOptions } from "./session";

/** Remembers which address is waiting for its verification email, without putting it in a URL. */
export const PENDING_EMAIL_COOKIE = "gifting_pending_email";
/** Hosted sign-in: the state the API issued and where to return, checked when the platform sends the person back. */
export const HOSTED_STATE_COOKIE = "gifting_sign_in_state";

export function stateCookieOptions() {
  return { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge: 10 * 60 };
}

/** Starts the session cookie from the API's sign-in answer. False when the answer has no refresh token. */
export async function saveSession(tokens: SessionTokens): Promise<boolean> {
  if (!tokens.refreshToken) return false;
  const startedAt = Date.now();
  const store = await cookies();
  store.set(SESSION_COOKIE, await sealSession({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, accessExpiresAt: tokens.expiresAt, startedAt }), sessionCookieOptions(startedAt));
  store.delete(PENDING_EMAIL_COOKIE);
  store.delete(HOSTED_STATE_COOKIE);
  return true;
}
