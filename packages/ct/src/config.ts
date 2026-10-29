import { AppError } from "@gifting/logger";
import { z } from "zod";

/** The project and store language. Catalog text is written in this locale only. */
export const CT_LOCALE = "en-US";

const required = (name: string) => z.string({ error: `${name} is not set.` }).min(1, `${name} is not set.`);
const url = (name: string) => z.url({ error: `${name} must be a URL.` });

const schema = z.object({
  CTP_PROJECT_KEY: required("CTP_PROJECT_KEY"),
  CTP_CLIENT_ID: required("CTP_CLIENT_ID"),
  CTP_CLIENT_SECRET: required("CTP_CLIENT_SECRET"),
  CTP_SCOPES: required("CTP_SCOPES"),
  CTP_AUTH_URL: url("CTP_AUTH_URL"),
  CTP_API_URL: url("CTP_API_URL"),
  CTP_IMPORT_URL: url("CTP_IMPORT_URL").optional(),
  CTP_STORE_KEY: z.string().min(1).default("gifting"),
  CTP_SETUP_PROJECT_KEY: z.string().optional(),
});

export type CtConfig = {
  projectKey: string;
  clientId: string;
  clientSecret: string;
  scopes: string[];
  authUrl: string;
  apiUrl: string;
  importUrl: string;
  storeKey: string;
  /** A project key named here may be set up even without "sandbox" or "dev" in it. */
  setupProjectKey?: string;
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
    importUrl: env.CTP_IMPORT_URL ?? env.CTP_API_URL.replace("://api.", "://import."),
    storeKey: env.CTP_STORE_KEY,
    ...(env.CTP_SETUP_PROJECT_KEY ? { setupProjectKey: env.CTP_SETUP_PROJECT_KEY } : {}),
  };
}

/** Setup scripts may only touch sandbox or dev projects. */
export function isSandboxProject(projectKey: string): boolean {
  return /(^|-)(sandbox|dev)(-|$)/.test(projectKey);
}

/**
 * Setup and seed scripts write to the project. They run on a sandbox or dev
 * project, or on a project whose exact key is named in CTP_SETUP_PROJECT_KEY
 * (for a POC project created with another name).
 */
export function maySetUpProject(config: Pick<CtConfig, "projectKey" | "setupProjectKey">): boolean {
  return isSandboxProject(config.projectKey) || config.setupProjectKey === config.projectKey;
}

export const NOT_SETUP_PROJECT_MESSAGE =
  "Refusing to write to a project whose key doesn't contain 'sandbox' or 'dev'. Name it in CTP_SETUP_PROJECT_KEY if it is a POC project.";
