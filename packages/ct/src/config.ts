import { AppError } from "@gifting/logger";
import { z } from "zod";

const required = (name: string) => z.string({ error: `${name} is not set.` }).min(1, `${name} is not set.`);
const url = (name: string) => z.url({ error: `${name} must be a URL.` });

const schema = z.object({
  CTP_PROJECT_KEY: required("CTP_PROJECT_KEY"),
  CTP_CLIENT_ID: required("CTP_CLIENT_ID"),
  CTP_CLIENT_SECRET: required("CTP_CLIENT_SECRET"),
  CTP_SCOPES: required("CTP_SCOPES"),
  CTP_AUTH_URL: url("CTP_AUTH_URL"),
  CTP_API_URL: url("CTP_API_URL"),
  CTP_STORE_KEY: z.string().min(1).default("gifting"),
});

export type CtConfig = {
  projectKey: string;
  clientId: string;
  clientSecret: string;
  scopes: string[];
  authUrl: string;
  apiUrl: string;
  storeKey: string;
};

/** Reads commercetools settings. Errors name the variable, never its value. */
export function loadCtConfig(source: Record<string, string | undefined> = process.env): CtConfig {
  const parsed = schema.safeParse(source);
  if (!parsed.success) throw new AppError("config_invalid", parsed.error.issues.map((i) => i.message).join(" "));
  const env = parsed.data;
  return {
    projectKey: env.CTP_PROJECT_KEY,
    clientId: env.CTP_CLIENT_ID,
    clientSecret: env.CTP_CLIENT_SECRET,
    scopes: env.CTP_SCOPES.split(/\s+/).filter(Boolean),
    authUrl: env.CTP_AUTH_URL,
    apiUrl: env.CTP_API_URL,
    storeKey: env.CTP_STORE_KEY,
  };
}

/** Setup scripts may only touch sandbox or dev projects. */
export function isSandboxProject(projectKey: string): boolean {
  return /(^|-)(sandbox|dev)(-|$)/.test(projectKey);
}
