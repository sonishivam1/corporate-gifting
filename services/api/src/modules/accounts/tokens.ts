/**
 * The product's own tokens (plan: commerce-connectors.md): sessions,
 * verification links and hosted sign-in state. They are encrypted with
 * API_SESSION_SECRET (A256GCM), so they are opaque outside this API and the
 * same on every commerce platform. Each has a `typ`, so one kind can never
 * stand in for another.
 */
import { EncryptJWT, jwtDecrypt } from "jose";

export const ACCESS_TTL_MS = 15 * 60_000;
export const SESSION_MAX_MS = 7 * 24 * 60 * 60_000;
export const VERIFY_TTL_MS = 60 * 60_000;
export const STATE_TTL_MS = 10 * 60_000;

export type AccessClaims = { typ: "access"; sid: string; sub: string; con: string };
export type RefreshClaims = { typ: "refresh"; sid: string; sub: string; con: string; start: number; ps?: string };
export type VerifyClaims = { typ: "verify"; sub: string; con: string; email: string; at: number };
export type StateClaims = { typ: "state"; nonce: string; con: string };
type Claims = AccessClaims | RefreshClaims | VerifyClaims | StateClaims;

/** True when the secret is 32 random bytes in hex (openssl rand -hex 32). */
export const isSessionSecret = (secret: string | undefined): secret is string => /^[0-9a-f]{64}$/i.test(secret ?? "");

export function createTokens(secretHex: string, now: () => number) {
  if (!isSessionSecret(secretHex)) throw new Error("API_SESSION_SECRET must be 32 random bytes in hex (openssl rand -hex 32).");
  const key = Uint8Array.from(Buffer.from(secretHex, "hex"));

  return {
    async seal(claims: Claims, expiresAt: number): Promise<string> {
      return new EncryptJWT({ ...claims })
        .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
        .setIssuedAt(Math.floor(now() / 1000))
        .setExpirationTime(Math.floor(expiresAt / 1000))
        .encrypt(key);
    },

    /** The claims of a token of this kind, or null when it's another kind, tampered with or expired. */
    async open<T extends Claims["typ"]>(token: string, typ: T): Promise<Extract<Claims, { typ: T }> | null> {
      try {
        const { payload } = await jwtDecrypt(token, key, { currentDate: new Date(now()) });
        return payload.typ === typ ? (payload as unknown as Extract<Claims, { typ: T }>) : null;
      } catch {
        return null;
      }
    },
  };
}
