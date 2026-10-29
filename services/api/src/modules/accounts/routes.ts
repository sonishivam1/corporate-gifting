import { accountView, emailInput, registerInput, sessionTokens, signInInput } from "@gifting/domain";
import type { FastifyRequest } from "fastify";
import { z } from "zod";

import { ApiError } from "../../http/errors";
import { defineRoute } from "../../http/route";

/**
 * Register and sign in (ADR 0015). Register answers 409 `email_taken` for an
 * account that already exists; sign-in and resend never reveal one.
 * The auth routes are public, but only the
 * sender app's server calls them: it keeps the tokens they return in an
 * encrypted cookie, so the browser never sees one.
 */
const service = (request: FastifyRequest) => {
  const accounts = request.server.accounts;
  if (!accounts) throw new ApiError(503, "auth_not_configured", "Sign-in is not configured on this server.");
  return accounts;
};

const accepted = z.object({ status: z.literal("check_email") });

export const register = defineRoute({
  method: "POST",
  url: "/v1/auth/register",
  auth: "public",
  schema: { body: registerInput, response: accepted },
  handler: async ({ body, request, reply }) => {
    await service(request).register(body);
    reply.code(202);
    return { status: "check_email" as const };
  },
});

export const verifyEmail = defineRoute({
  method: "POST",
  url: "/v1/auth/verify-email",
  auth: "public",
  schema: { body: z.object({ token: z.string().min(1).max(200) }), response: z.object({ status: z.literal("verified") }) },
  handler: async ({ body, request }) => {
    await service(request).verifyEmail(body.token);
    return { status: "verified" as const };
  },
});

export const resendVerification = defineRoute({
  method: "POST",
  url: "/v1/auth/resend-verification",
  auth: "public",
  schema: { body: emailInput, response: accepted },
  handler: async ({ body, request, reply }) => {
    await service(request).resendVerification(body.email);
    reply.code(202);
    return { status: "check_email" as const };
  },
});

export const signIn = defineRoute({
  method: "POST",
  url: "/v1/auth/sign-in",
  auth: "public",
  schema: { body: signInInput, response: sessionTokens.extend({ account: accountView }) },
  handler: async ({ body, request }) => service(request).signIn(body.email, body.password),
});

export const refresh = defineRoute({
  method: "POST",
  url: "/v1/auth/refresh",
  auth: "public",
  schema: { body: z.object({ refreshToken: z.string().min(1) }), response: sessionTokens },
  handler: async ({ body, request }) => service(request).refresh(body.refreshToken),
});

export const signOut = defineRoute({
  method: "POST",
  url: "/v1/auth/sign-out",
  auth: "public",
  schema: { body: z.object({ accessToken: z.string().min(1).optional(), refreshToken: z.string().min(1).optional() }), response: z.object({ status: z.literal("signed_out") }) },
  handler: async ({ body, request }) => {
    await service(request).signOut(body);
    return { status: "signed_out" as const };
  },
});

/** The signed-in person. */
export const me = defineRoute({
  method: "GET",
  url: "/v1/me",
  schema: { response: accountView },
  handler: async ({ account }) => account,
});

export const accountsRoutes = [register, verifyEmail, resendVerification, signIn, refresh, signOut, me];
