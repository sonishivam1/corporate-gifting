import "server-only";

import { EncryptJWT, jwtDecrypt } from "jose";

/**
 * The signed-in session (ADR 0015): commercetools' access and refresh tokens,
 * encrypted (A256GCM) into one http-only cookie with this app's
 * SESSION_SECRET. The browser holds only ciphertext it can't read or change;
 * only this app's server decrypts it, to call the Gifting API.
 */
export const SESSION_COOKIE = "gifting_session";
/** A session ends after a week, however active. */
export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

export type Session = {
  accessToken: string;
  refreshToken: string;
  /** Epoch milliseconds when the access token expires. */
  accessExpiresAt: number;
  /** Epoch milliseconds when the session started. */
  startedAt: number;
};

const secret = process.env.SESSION_SECRET ?? "";
/** True when SESSION_SECRET is 32 random bytes in hex (openssl rand -hex 32). */
export const sessionConfigured = /^[0-9a-f]{64}$/i.test(secret);
const key = sessionConfigured ? Uint8Array.from(Buffer.from(secret, "hex")) : null;

export async function sealSession(session: Session): Promise<string> {
  if (!key) throw new Error("SESSION_SECRET is not set to 32 bytes in hex.");
  return new EncryptJWT({ ...session })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(session.startedAt / 1000) + SESSION_MAX_AGE_SECONDS)
    .encrypt(key);
}

/** The session in a cookie value, or null when it's missing, tampered with or past its week. */
export async function openSession(value: string | undefined): Promise<Session | null> {
  if (!key || !value) return null;
  try {
    const { payload } = await jwtDecrypt(value, key);
    const { accessToken, refreshToken, accessExpiresAt, startedAt } = payload as Record<string, unknown>;
    if (typeof accessToken !== "string" || typeof refreshToken !== "string" || typeof accessExpiresAt !== "number" || typeof startedAt !== "number") return null;
    return { accessToken, refreshToken, accessExpiresAt, startedAt };
  } catch {
    return null;
  }
}

export function sessionCookieOptions(startedAt: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: Math.max(0, Math.floor((startedAt + SESSION_MAX_AGE_SECONDS * 1000 - Date.now()) / 1000)),
  };
}
