import "server-only";

import { getLink, type LinkView } from "./api";

/** The link shape before it reaches the API: 32 random bytes as base64url. Anything else is not a gift link. */
export const TOKEN_SHAPE = /^[A-Za-z0-9_-]{20,100}$/;

export type Resolved = { kind: "unreachable" } | { kind: "view"; view: LinkView };

export async function resolveLink(token: string): Promise<Resolved> {
  if (!TOKEN_SHAPE.test(token)) return { kind: "view", view: { state: "invalid" } };
  const view = await getLink(token);
  return view ? { kind: "view", view } : { kind: "unreachable" };
}
