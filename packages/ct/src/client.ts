import { type ByProjectKeyRequestBuilder, createApiBuilderFromCtpClient } from "@commercetools/platform-sdk";
import { ClientBuilder } from "@commercetools/ts-client";

import type { CtConfig } from "./config";

export type CtApi = ByProjectKeyRequestBuilder;

/**
 * A commercetools API root for one project, authenticated with client
 * credentials. Server only: never import this from an app (CLAUDE.md).
 */
export function createCtApi(config: CtConfig): CtApi {
  const client = new ClientBuilder()
    .withProjectKey(config.projectKey)
    .withClientCredentialsFlow({
      host: config.authUrl,
      projectKey: config.projectKey,
      credentials: { clientId: config.clientId, clientSecret: config.clientSecret },
      scopes: config.scopes,
      httpClient: fetch,
    })
    .withHttpMiddleware({
      host: config.apiUrl,
      httpClient: fetch,
      enableRetry: true,
      maskSensitiveHeaderData: true,
    })
    .build();

  return createApiBuilderFromCtpClient(client).withProjectKey({ projectKey: config.projectKey });
}

/** True when a commercetools error is a 404, for "create if missing" setup steps. */
export function isNotFound(err: unknown): boolean {
  const e = err as { statusCode?: number; code?: number; status?: number };
  return e?.statusCode === 404 || e?.code === 404 || e?.status === 404;
}
