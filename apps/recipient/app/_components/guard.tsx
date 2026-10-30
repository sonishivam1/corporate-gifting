import type { ReactNode } from "react";

import type { LinkView } from "@/lib/api";
import { copy } from "@/lib/copy";
import { resolveLink } from "@/lib/link";

import { Frame, Notice } from "./frame";

/**
 * Every page under a gift link starts here. It resolves the link and, unless the
 * gift can be chosen right now, returns the notice to show instead of the page.
 */
export async function guard(token: string): Promise<{ ok: true; view: Extract<LinkView, { state: "open" }> } | { ok: false; page: ReactNode }> {
  const resolved = await resolveLink(token);
  const t = await copy(["redeem.privacy", "redeem.error.unavailable", "redeem.error.unavailableHint", "redeem.error.invalid", "redeem.error.invalidHint", "redeem.error.used", "redeem.error.usedHint", "redeem.error.expired", "redeem.error.expiredHint"]);
  const frame = (title: string, hint: string) => ({
    ok: false as const,
    page: (
      <Frame privacy={t["redeem.privacy"]}>
        <Notice title={title} hint={hint} />
      </Frame>
    ),
  });

  if (resolved.kind === "unreachable") return frame(t["redeem.error.unavailable"], t["redeem.error.unavailableHint"]);
  const view = resolved.view;
  if (view.state === "open") return { ok: true, view };
  if (view.state === "used") return frame(t["redeem.error.used"], t["redeem.error.usedHint"]);
  if (view.state === "expired") return frame(t["redeem.error.expired"], t["redeem.error.expiredHint"]);
  return frame(t["redeem.error.invalid"], t["redeem.error.invalidHint"]);
}
