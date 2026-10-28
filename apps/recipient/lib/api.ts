import "server-only";

/**
 * Calls to the Gifting API. Apps talk only to the API, never to commercetools,
 * the database or providers (ADR 0004).
 */
const API_URL = process.env.API_PUBLIC_URL ?? "http://localhost:4000";

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
