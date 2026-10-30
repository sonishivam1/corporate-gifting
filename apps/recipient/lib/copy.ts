import "server-only";

import { type ContentKey, createStaticContent } from "@gifting/content";

const content = createStaticContent();

/** The words for a page, from the content layer. Pages ask for keys and pass the result to client components as props. */
export async function copy<K extends ContentKey>(keys: readonly K[], values: Record<string, string | number> = {}): Promise<Record<K, string>> {
  const entries = await Promise.all(keys.map(async (k) => [k, await content.getContent(k, values)] as const));
  return Object.fromEntries(entries) as Record<K, string>;
}
