import { connection } from "next/server";

import { getApiMeta } from "@/lib/api";

/** Shows whether this app can reach the Gifting API. Rendered per request, never at build time. */
export async function ApiStatus() {
  await connection();
  const meta = await getApiMeta();
  return (
    <p className="mt-8 text-sm text-muted-foreground">
      {meta ? `Gifting API ${meta.version}: ${meta.modules.length} modules registered.` : "Gifting API not reachable (start it with pnpm dev)."}
    </p>
  );
}
