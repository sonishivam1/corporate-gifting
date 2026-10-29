import "server-only";

import { accountView, type AccountView } from "@gifting/domain";
import { cookies } from "next/headers";
import { cache } from "react";

import { openSession, SESSION_COOKIE } from "./session";

/**
 * Calls to the Gifting API. Apps talk only to the API, never to commercetools,
 * the database or providers (ADR 0004). Signed-in calls carry the access token
 * from the session cookie, from this server only.
 */
export const API_URL = (process.env.API_PUBLIC_URL ?? "http://localhost:4000").replace(/\/$/, "");

export type ApiMeta = {
  name: string;
  version: string;
  modules: { name: string; milestone: string; routes: number }[];
};

export async function getApiMeta(): Promise<ApiMeta | null> {
  try {
    const res = await fetch(`${API_URL}/v1/meta`, { cache: "no-store", signal: AbortSignal.timeout(2000) });
    return res.ok ? ((await res.json()) as ApiMeta) : null;
  } catch {
    return null;
  }
}

export type SignInMode = "password" | "hosted";

/**
 * How this deployment signs people in: with our password forms, or on the
 * commerce platform's own page (its connector's capability). Password when
 * the API can't be reached, so the page still renders and explains.
 */
export async function getSignInMode(): Promise<SignInMode> {
  try {
    // Read per request: a page built while the API was down must not freeze in one mode.
    const res = await fetch(`${API_URL}/v1/auth/options`, { cache: "no-store", signal: AbortSignal.timeout(2000) });
    if (res.ok && ((await res.json()) as { signIn?: string }).signIn === "hosted") return "hosted";
  } catch {
    // Unreachable: fall through to the password forms, which report it on submit.
  }
  return "password";
}

export type ApiResult<T> = { ok: true; status: number; data: T } | { ok: false; status: number; code: string; message: string };

/** POST to the API; never throws for an API error or an unreachable API. */
export async function apiPost<T>(path: string, body: unknown, accessToken?: string): Promise<ApiResult<T>> {
  try {
    const res = await fetch(`${API_URL}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}) },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    const json = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
    if (res.ok) return { ok: true, status: res.status, data: json as T };
    return { ok: false, status: res.status, code: json?.error?.code ?? "error", message: json?.error?.message ?? "Something went wrong." };
  } catch {
    return { ok: false, status: 0, code: "unavailable", message: "We can't reach Gifting right now. Try again in a minute." };
  }
}

export type MeResult = { kind: "account"; me: AccountView } | { kind: "signed-out" } | { kind: "unavailable" };

/** The signed-in person, once per request (React `cache`). */
export const getMe = cache(async (): Promise<MeResult> => {
  const session = await openSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) return { kind: "signed-out" };
  let res: Response;
  try {
    res = await fetch(`${API_URL}/v1/me`, { headers: { authorization: `Bearer ${session.accessToken}` }, cache: "no-store", signal: AbortSignal.timeout(5000) });
  } catch {
    return { kind: "unavailable" };
  }
  if (res.status === 401) return { kind: "signed-out" };
  if (!res.ok) return { kind: "unavailable" };
  const parsed = accountView.safeParse(await res.json());
  return parsed.success ? { kind: "account", me: parsed.data } : { kind: "unavailable" };
});
