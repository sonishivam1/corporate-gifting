import {
  type ByProjectKeyRequestBuilder,
  createApiBuilderFromCtpClient,
  type ImportOperation,
  type ImportRequest,
  type ImportSummary,
} from "@commercetools/importapi-sdk";
import { ClientBuilder } from "@commercetools/ts-client";

import type { CtConfig } from "./config";

export type CtImportApi = ByProjectKeyRequestBuilder;

/**
 * A commercetools Import API root for one project. Used only by the catalog
 * import scripts in `infra/`, so it is a separate entry point
 * (`@gifting/ct/import`) and the services don't bundle the Import SDK.
 */
export function createCtImportApi(config: CtConfig): CtImportApi {
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
      host: config.importUrl,
      httpClient: fetch,
      enableRetry: true,
      maskSensitiveHeaderData: true,
    })
    .build();

  return createApiBuilderFromCtpClient(client).withProjectKeyValue({ projectKey: config.projectKey });
}

/** The Import API takes at most 20 resources per request. */
export const IMPORT_BATCH_SIZE = 20;

export function batches<T>(items: readonly T[], size = IMPORT_BATCH_SIZE): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

type Importable = Extract<ImportRequest, { type: "business-unit" | "category" | "customer" | "inventory" | "product-draft" }>;

function submit(api: CtImportApi, importContainerKey: string, request: Importable) {
  const args = { importContainerKey };
  switch (request.type) {
    case "business-unit":
      return api.businessUnits().importContainers().withImportContainerKeyValue(args).post({ body: request }).execute();
    case "category":
      return api.categories().importContainers().withImportContainerKeyValue(args).post({ body: request }).execute();
    case "customer":
      return api.customers().importContainers().withImportContainerKeyValue(args).post({ body: request }).execute();
    case "inventory":
      return api.inventories().importContainers().withImportContainerKeyValue(args).post({ body: request }).execute();
    case "product-draft":
      return api.productDrafts().importContainers().withImportContainerKeyValue(args).post({ body: request }).execute();
  }
}

export type ImportRun = {
  importContainerKey: string;
  summary: ImportSummary;
  /** Operations that did not end `imported` (at most 500). */
  failed: ImportOperation[];
};

/**
 * Sends the requests to a new import container (one per run, so its summary
 * counts only this run; commercetools deletes it after 72 hours), then waits
 * until nothing is still processing. Re-running with the same resource keys
 * updates the same resources.
 */
export async function runImport(
  api: CtImportApi,
  containerPrefix: string,
  requests: Importable[],
  { pollMs = 3_000, timeoutMs = 20 * 60_000, unresolvedPatienceMs = 2 * 60_000 } = {},
): Promise<ImportRun> {
  const importContainerKey = `${containerPrefix}-${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}`;
  await api.importContainers().post({ body: { key: importContainerKey } }).execute();
  for (const request of requests) await submit(api, importContainerKey, request);

  const container = api.importContainers().withImportContainerKeyValue({ importContainerKey });
  const started = Date.now();
  let summary = (await container.importSummaries().get().execute()).body;
  let imported = summary.states.imported;
  let progressedAt = Date.now();
  // Unresolved operations (a product whose category is still being created)
  // are retried by commercetools, so keep waiting while they still resolve.
  const busy = () =>
    summary.states.processing + summary.states.waitForMasterVariant > 0 ||
    (summary.states.unresolved > 0 && Date.now() - progressedAt < unresolvedPatienceMs);
  while (busy() && Date.now() - started < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, pollMs));
    summary = (await container.importSummaries().get().execute()).body;
    if (summary.states.imported > imported) {
      imported = summary.states.imported;
      progressedAt = Date.now();
    }
  }

  const failed: ImportOperation[] = [];
  if (summary.states.imported !== summary.total) {
    for (const state of ["rejected", "validationFailed", "unresolved", "processing", "waitForMasterVariant", "partiallyImported"]) {
      const page = await container.importOperations().get({ queryArgs: { state, limit: 500 } }).execute();
      failed.push(...page.body.results);
    }
  }
  return { importContainerKey, summary, failed };
}

/** Wraps resources of one type into requests of at most 20. */
export function importRequests<T extends Importable["type"]>(
  type: T,
  resources: readonly Extract<Importable, { type: T }>["resources"][number][],
): Importable[] {
  return batches(resources).map((chunk) => ({ type, resources: chunk }) as Importable);
}
