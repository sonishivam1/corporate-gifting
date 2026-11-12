import "server-only";

import {
  accountView,
  type Action,
  type AccountView,
  balanceView,
  campaignDetailView,
  campaignListView,
  type CollectionInput,
  collectionView,
  type CollectionView,
  companyMembersView,
  decisionResultView,
  estimateView,
  giftRowView,
  invitationPreview,
  invitationsView,
  invitationView,
  type InviteInput,
  meView,
  type NameInput,
  type OverviewRange,
  overviewView,
  productView,
  recipientImportView,
  type RecipientImportInput,
  recipientListView,
  type RoleChangeInput,
  type SendInput,
  submitResultView,
  teamView,
} from "@gifting/domain";
import { cookies } from "next/headers";
import { cache } from "react";
import { z } from "zod";

import { workspaceHeaders } from "./dev-session";
import { openSession, SESSION_COOKIE } from "./session";

/**
 * Calls to the Gifting API. Apps talk only to the API, never to commercetools,
 * the database or providers (ADR 0004). Signed-in calls carry the access token
 * from the session cookie, from this server only. Dashboard calls also carry
 * the chosen company and team; the API checks them against the person's memberships. Responses are parsed with the same
 * schemas the API uses, so a drift fails loudly here.
 */
export const API_URL = (process.env.API_PUBLIC_URL ?? "http://localhost:4000").replace(/\/$/, "");

export class ApiCallError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiCallError";
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

const errorShape = z.object({ error: z.object({ code: z.string(), message: z.string() }) });

async function call<S extends z.ZodType>(
  path: string,
  schema: S,
  init: { method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"; body?: unknown; headers?: Record<string, string> } = {},
): Promise<z.infer<S>> {
  // Outside the try: reading cookies is how Next marks the page dynamic, and that signal must not be swallowed.
  const workspace = await workspaceHeaders();
  const session = await openSession((await cookies()).get(SESSION_COOKIE)?.value);
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: init.method ?? "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
      headers: {
        ...workspace,
        ...(session ? { authorization: `Bearer ${session.accessToken}` } : {}),
        ...(init.body !== undefined ? { "content-type": "application/json" } : {}),
        ...init.headers,
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ApiCallError(503, "api_unreachable", "The Gifting API isn't reachable. Start it with pnpm dev.");
  }
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const parsed = errorShape.safeParse(json);
    throw parsed.success
      ? new ApiCallError(res.status, parsed.data.error.code, parsed.data.error.message)
      : new ApiCallError(res.status, "api_error", "The Gifting API returned an error.");
  }
  return schema.parse(json);
}

/** The dashboard's workspace: the person's roles and allowed actions, company, team, approvers. Once per request. */
export const getWorkspace = cache(() => call("/v1/workspace", meView));

/** True when the person's roles on the current team allow the action (ADR 0016). The API refuses it anyway. */
export async function allowed(action: Action): Promise<boolean> {
  return (await getWorkspace()).actions.includes(action);
}

export const getBalance = (teamKey: string) => call(`/v1/teams/${encodeURIComponent(teamKey)}/balance`, balanceView);

/** The Home overview for a range: balance, sent and chosen, expiring soon, daily activity, statuses. */
export const getOverview = (teamKey: string, range: OverviewRange) =>
  call(`/v1/teams/${encodeURIComponent(teamKey)}/overview?range=${range}`, overviewView);

export function getProducts(filters: { budget?: number; occasion?: string; category?: string; q?: string } = {}) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) if (v) params.set(k, String(v));
  const qs = params.size ? `?${params}` : "";
  return call(`/v1/catalog/products${qs}`, z.object({ products: z.array(productView) })).then((r) => r.products);
}

export const getCollections = (budget?: number) =>
  call(`/v1/collections${budget ? `?budget=${budget}` : ""}`, z.object({ collections: z.array(collectionView) })).then(
    (r) => r.collections,
  );

/** A collection with its own items; the company's are listed first. Archived ones are "not found". */
export async function getCollection(id: string): Promise<CollectionView | null> {
  return (await getCollections()).find((c) => c.id === id) ?? null;
}

export const createCollection = (input: CollectionInput) => call("/v1/collections", collectionView, { method: "POST", body: input });

export const updateCollection = (id: string, input: CollectionInput) =>
  call(`/v1/collections/${encodeURIComponent(id)}`, collectionView, { method: "PUT", body: input });

export const archiveCollection = (id: string) =>
  call(`/v1/collections/${encodeURIComponent(id)}/archive`, z.object({ archived: z.literal(true) }), { method: "POST" });

/** The company directory: the first page by name, or the people matching `q`. */
export const getRecipients = (q?: string) => call(`/v1/recipients${q ? `?q=${encodeURIComponent(q)}` : ""}`, recipientListView);

export const importRecipients = (input: RecipientImportInput) =>
  call("/v1/recipients/import", recipientImportView, { method: "POST", body: input });

export const getCampaigns = (status = "all", limit?: number) =>
  call(`/v1/campaigns?status=${status}${limit ? `&limit=${limit}` : ""}`, campaignListView);

export const getCampaign = (id: string) => call(`/v1/campaigns/${encodeURIComponent(id)}`, campaignDetailView);

export const getCampaignGifts = (id: string) =>
  call(`/v1/campaigns/${encodeURIComponent(id)}/gifts`, z.object({ gifts: z.array(giftRowView) })).then((r) => r.gifts);

export const estimateSend = (input: SendInput) => call("/v1/campaigns/estimate", estimateView, { method: "POST", body: input });

export const createCampaign = (input: SendInput, idempotencyKey: string) =>
  call("/v1/campaigns", z.object({ id: z.string() }), {
    method: "POST",
    body: input,
    headers: { "idempotency-key": idempotencyKey },
  });

export const submitCampaign = (id: string) =>
  call(`/v1/campaigns/${encodeURIComponent(id)}/submit`, submitResultView, { method: "POST" });

export const decideCampaign = (id: string, decision: "approve" | "decline") =>
  call(`/v1/campaigns/${encodeURIComponent(id)}/${decision}`, decisionResultView, { method: "POST" });

// Members, teams and invitations of the company the dashboard works in (ADR 0017).
const ok = z.object({ status: z.literal("ok") });
const id = encodeURIComponent;

export const getCompanyMembers = cache(() => call("/v1/company/members", companyMembersView));

export const addMemberRole = (customerId: string, input: RoleChangeInput) =>
  call(`/v1/company/members/${id(customerId)}/roles`, companyMembersView, { method: "POST", body: input });

export const removeMemberRole = (customerId: string, input: RoleChangeInput) =>
  call(`/v1/company/members/${id(customerId)}/roles?role=${input.role}${input.teamKey ? `&teamKey=${id(input.teamKey)}` : ""}`, companyMembersView, {
    method: "DELETE",
  });

export const removeMember = (customerId: string) => call(`/v1/company/members/${id(customerId)}`, companyMembersView, { method: "DELETE" });

export const createTeam = (name: string) => call("/v1/company/teams", teamView, { method: "POST", body: { name } });

export const renameTeam = (teamKey: string, name: string) => call(`/v1/company/teams/${id(teamKey)}`, teamView, { method: "PATCH", body: { name } });

export const getInvitations = () => call("/v1/company/invitations", invitationsView).then((r) => r.invitations);

export const sendInvitation = (input: InviteInput) => call("/v1/company/invitations", invitationView, { method: "POST", body: input });

export const resendInvitation = (invitationId: string) => call(`/v1/company/invitations/${id(invitationId)}/resend`, ok, { method: "POST" });

export const revokeInvitation = (invitationId: string) => call(`/v1/company/invitations/${id(invitationId)}`, ok, { method: "DELETE" });

/** What an invitation link offers. Anyone with the link may read it; it holds no email address. */
export const getInvitationPreview = (token: string) => call(`/v1/invitations/${id(token)}`, invitationPreview);

/** Accepts as the signed-in person; the API checks the invitation was sent to their address. */
export const acceptInvitation = (token: string) =>
  call(`/v1/invitations/${id(token)}/accept`, z.object({ companyKey: z.string(), teamKey: z.string().nullable(), role: z.string() }), { method: "POST" });

export const updateMyName = (input: NameInput) => call("/v1/me", accountView, { method: "PATCH", body: input });
