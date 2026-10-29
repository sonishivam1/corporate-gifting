"use server";

import { type AccountView, emailInput, type RegisterInput, registerFormInput, type SessionTokens, signInInput } from "@gifting/domain";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { apiPost } from "@/lib/api";
import { openSession, SESSION_COOKIE, sessionConfigured } from "@/lib/session";
import { HOSTED_STATE_COOKIE, PENDING_EMAIL_COOKIE, saveSession, stateCookieOptions } from "@/lib/sign-in";

/**
 * The register and sign-in forms post here (server actions): this server
 * calls the Gifting API, and only it ever holds the tokens. Next.js checks
 * that a server action comes from this app's own pages.
 */

export type FormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  /** The values to show again after a refusal (never the password). */
  values?: Record<string, string>;
  /** Sign-in refused because the email isn't verified yet. */
  unverified?: boolean;
  /** Register refused because the email already has an account. */
  emailTaken?: boolean;
  /** Hosted sign-in: the platform's page, which the browser opens as a full page load. */
  goTo?: string;
  sent?: boolean;
};

function fieldErrors(issues: readonly { path: PropertyKey[]; message: string }[]) {
  const errors: Record<string, string> = {};
  for (const issue of issues) {
    const field = String(issue.path[0] ?? "form");
    errors[field] ??= issue.message;
  }
  return errors;
}

/** Only paths inside this app may be returned to after sign-in. */
function safeReturnTo(value: FormDataEntryValue | null): string {
  const path = typeof value === "string" ? value : "";
  return path.startsWith("/") && !path.startsWith("//") ? path : "/";
}

export async function registerAction(_prev: FormState, form: FormData): Promise<FormState> {
  const values = {
    firstName: String(form.get("firstName") ?? ""),
    lastName: String(form.get("lastName") ?? ""),
    email: String(form.get("email") ?? ""),
    companyName: String(form.get("companyName") ?? ""),
    acceptTerms: form.get("acceptTerms") === "on" ? "on" : "",
  };
  const parsed = registerFormInput.safeParse({
    ...values,
    password: String(form.get("password") ?? ""),
    confirmPassword: String(form.get("confirmPassword") ?? ""),
    acceptTerms: values.acceptTerms === "on",
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error.issues), values };

  // "Confirm password" stays in this app; the API gets the account fields only.
  const { firstName, lastName, email, password, companyName, acceptTerms } = parsed.data;
  const account: RegisterInput = { firstName, lastName, email, password, companyName, acceptTerms };
  const res = await apiPost("/v1/auth/register", account);
  if (!res.ok) {
    if (res.code === "email_taken") return { emailTaken: true, fieldErrors: { email: res.message }, values };
    return { error: res.status === 400 ? "Check the highlighted fields." : res.message, values };
  }

  (await cookies()).set(PENDING_EMAIL_COOKIE, parsed.data.email, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 60 });
  redirect("/register/check-email");
}

export async function resendVerificationAction(_prev: FormState, form: FormData): Promise<FormState> {
  const pending = (await cookies()).get(PENDING_EMAIL_COOKIE)?.value;
  const parsed = emailInput.safeParse({ email: String(form.get("email") ?? "") || pending });
  if (!parsed.success) return { error: "Enter the email address you registered with." };
  const res = await apiPost("/v1/auth/resend-verification", parsed.data);
  if (!res.ok) return { error: res.message };
  return { sent: true };
}

export async function signInAction(_prev: FormState, form: FormData): Promise<FormState> {
  const values = { email: String(form.get("email") ?? "") };
  const parsed = signInInput.safeParse({ ...values, password: String(form.get("password") ?? "") });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error.issues), values };
  if (!sessionConfigured) return { error: "Sign-in isn't set up on this server yet.", values };

  const res = await apiPost<SessionTokens & { account: AccountView }>("/v1/auth/sign-in", parsed.data);
  if (!res.ok) {
    if (res.code === "email_not_verified") return { unverified: true, error: res.message, values };
    return { error: res.message, values };
  }

  if (!(await saveSession(res.data))) return { error: "Sign-in didn't work. Try again.", values };
  redirect(safeReturnTo(form.get("returnTo")));
}

/**
 * Hosted sign-in (a platform with its own sign-in page): asks the API where
 * to send the person and keeps the state in a cookie to check on return. The
 * form then opens that page as a full page load (not a server-action
 * redirect), so the cookies set on the way back always reach the browser.
 * The email pre-fills the platform's page.
 */
export async function hostedSignInAction(_prev: FormState, form: FormData): Promise<FormState> {
  const values = { email: String(form.get("email") ?? "") };
  const parsed = emailInput.safeParse(values);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error.issues), values };
  if (!sessionConfigured) return { error: "Sign-in isn't set up on this server yet.", values };

  const res = await apiPost<{ url: string; state: string }>("/v1/auth/hosted/start", { loginHint: parsed.data.email });
  if (!res.ok) return { error: res.message, values };
  (await cookies()).set(HOSTED_STATE_COOKIE, JSON.stringify({ state: res.data.state, returnTo: safeReturnTo(form.get("returnTo")) }), stateCookieOptions());
  return { goTo: res.data.url, values };
}

export async function signOutAction(): Promise<void> {
  const store = await cookies();
  const session = await openSession(store.get(SESSION_COOKIE)?.value);
  if (session) await apiPost("/v1/auth/sign-out", { accessToken: session.accessToken, refreshToken: session.refreshToken });
  store.delete(SESSION_COOKIE);
  redirect("/sign-in");
}
