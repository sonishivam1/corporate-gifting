/**
 * Accounts (B2C, ADR 0015): one person per account. The register and sign-in
 * inputs, the password rules and the account the API returns. Pure and shared,
 * so the sender app checks a form (and shows its live checklist) with the same
 * rules the API enforces.
 */
import { z } from "zod";

import { normalizeEmail } from "./members";

export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;

/** Every rule a new password must meet, in the order the checklist shows them. */
export const PASSWORD_RULES = [
  { id: "length", label: `At least ${PASSWORD_MIN} characters`, test: (p: string) => p.length >= PASSWORD_MIN },
  { id: "upper", label: "An uppercase letter", test: (p: string) => /\p{Lu}/u.test(p) },
  { id: "lower", label: "A lowercase letter", test: (p: string) => /\p{Ll}/u.test(p) },
  { id: "number", label: "A number", test: (p: string) => /\d/.test(p) },
  { id: "special", label: "A special character, like ! ? # or @", test: (p: string) => /[^\p{L}\d\s]/u.test(p) },
] as const;

export type PasswordRuleId = (typeof PASSWORD_RULES)[number]["id"];

/** Each rule and whether the password meets it, for the live checklist. */
export function passwordChecks(password: string): { id: PasswordRuleId; label: string; met: boolean }[] {
  return PASSWORD_RULES.map((rule) => ({ id: rule.id, label: rule.label, met: rule.test(password) }));
}

/**
 * Why a password is refused, or null when it is acceptable. With `email`, it
 * also refuses a password containing the part of the email before the @.
 */
export function passwordProblem(password: string, email?: string): string | null {
  if (password.length === 0) return "Enter a password.";
  if (password.length > PASSWORD_MAX) return `Use at most ${PASSWORD_MAX} characters.`;
  const unmet = passwordChecks(password).filter((c) => !c.met);
  if (unmet.length > 0) return `Your password needs: ${unmet.map((c) => c.label.toLowerCase()).join(", ")}.`;
  const name = email ? normalizeEmail(email).split("@")[0] : undefined;
  if (name && name.length >= 3 && password.toLowerCase().includes(name)) return "Don't use your email address in your password.";
  return null;
}

// Trimmed and lowercased before the format check, so " Ada@Example.com " is accepted.
const email = z.preprocess((value) => (typeof value === "string" ? normalizeEmail(value) : value), z.email({ error: "Enter a valid email address." }).max(254));

const name = (label: string) => z.string().trim().min(1, `Enter your ${label}.`).max(100, `Use at most 100 characters.`);

const registerFields = z.object({
  firstName: name("first name"),
  lastName: name("last name"),
  email,
  password: z.string(),
  /** Optional: shown on gift messages and receipts. */
  companyName: z
    .string()
    .trim()
    .max(100, "Use at most 100 characters.")
    .optional()
    .transform((v) => (v ? v : undefined)),
  acceptTerms: z.literal(true, { error: "Accept the terms to continue." }),
});

const passwordRule = (value: { password: string; email: string }, ctx: z.RefinementCtx) => {
  const problem = passwordProblem(value.password, value.email);
  if (problem) ctx.addIssue({ code: "custom", path: ["password"], message: problem });
};

/** What the API accepts on register. */
export const registerInput = registerFields.superRefine(passwordRule);
export type RegisterInput = z.infer<typeof registerInput>;

/** The register form: the API's fields plus "confirm password", which never leaves the app. */
export const registerFormInput = registerFields
  .extend({ confirmPassword: z.string() })
  .superRefine(passwordRule)
  .superRefine((value, ctx) => {
    if (value.confirmPassword !== value.password) ctx.addIssue({ code: "custom", path: ["confirmPassword"], message: "The passwords don't match." });
  });

export const signInInput = z.object({
  email,
  password: z.string().min(1, "Enter your password.").max(PASSWORD_MAX),
});
export type SignInInput = z.infer<typeof signInInput>;

export const emailInput = z.object({ email });

/** The signed-in person, as `GET /v1/me` returns them. */
export const accountView = z.object({
  id: z.string(),
  email: z.email(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  companyName: z.string().nullable(),
});
export type AccountView = z.infer<typeof accountView>;

/** What the API returns on sign-in or refresh: tokens for the app's server only. */
export const sessionTokens = z.object({
  accessToken: z.string().min(1),
  /** Absent on refresh; the original refresh token stays valid. */
  refreshToken: z.string().min(1).optional(),
  /** Epoch milliseconds when the access token expires. */
  expiresAt: z.number().int().positive(),
});
export type SessionTokens = z.infer<typeof sessionTokens>;
