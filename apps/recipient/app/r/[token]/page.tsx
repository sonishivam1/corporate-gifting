import type { CardCover } from "@gifting/domain";
import { Badge } from "@gifting/ui/components/badge";
import { Button } from "@gifting/ui/components/button";
import { GreetingCard } from "@gifting/ui/components/greeting-card";
import Link from "next/link";

import { getItems } from "@/lib/api";
import { copy } from "@/lib/copy";
import { TOKEN_SHAPE } from "@/lib/link";

import { Frame, Notice } from "../../_components/frame";
import { guard } from "../../_components/guard";

/** The gift: what the sender wrote, then everything to choose from. */
export default async function Gift({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const g = await guard(token);
  if (!g.ok) return g.page;

  const t = await copy([
    "redeem.privacy", "redeem.choose.title", "redeem.choose.subtitle", "redeem.error.unavailable", "redeem.error.unavailableHint",
    "redeem.bundle.title", "redeem.bundle.subtitle", "redeem.bundle.claim", "redeem.bundle.soldOut", "redeem.bundle.soldOutHint",
  ]);
  const [from, closes] = await Promise.all([copy(["redeem.unwrap.from"], { senderName: g.view.from }), copy(["redeem.unwrap.closes"], { closesOn: g.view.expiresOn })]);
  const items = TOKEN_SHAPE.test(token) ? await getItems(token) : null;

  // A bundle: every gift is theirs, nothing to choose. One address ships them all.
  if (items?.state === "open" && items.bundle) {
    return (
      <Frame privacy={t["redeem.privacy"]}>
        <div className="grid gap-5 p-5">
          <GreetingCard cover={g.view.cover as CardCover} headline={g.view.headline} message={g.view.message} from={from["redeem.unwrap.from"]} />
          <p className="text-center text-xs text-muted-foreground">{closes["redeem.unwrap.closes"]}</p>
          <div>
            <h2 className="text-lg font-semibold">{t["redeem.bundle.title"]}</h2>
            <p className="text-sm text-muted-foreground">{t["redeem.bundle.subtitle"]}</p>
          </div>
          <ul className="grid gap-3">
            {items.items.map((i) => (
              <li key={i.sku} className="grid gap-1 rounded-lg border p-3">
                <span className="font-medium">{i.name}</span>
                <span className="text-xs text-muted-foreground">{i.brand}</span>
                <span className="text-sm">{i.description}</span>
              </li>
            ))}
          </ul>
          {items.allInStock ? (
            <Button asChild size="lg">
              <Link href={`/r/${token}/ship`}>{t["redeem.bundle.claim"]}</Link>
            </Button>
          ) : (
            <Notice title={t["redeem.bundle.soldOut"]} hint={t["redeem.bundle.soldOutHint"]} />
          )}
        </div>
      </Frame>
    );
  }

  return (
    <Frame privacy={t["redeem.privacy"]}>
      <div className="grid gap-5 p-5">
        <GreetingCard cover={g.view.cover as CardCover} headline={g.view.headline} message={g.view.message} from={from["redeem.unwrap.from"]} />
        <p className="text-center text-xs text-muted-foreground">{closes["redeem.unwrap.closes"]}</p>
        <div>
          <h2 className="text-lg font-semibold">{t["redeem.choose.title"]}</h2>
          <p className="text-sm text-muted-foreground">{t["redeem.choose.subtitle"]}</p>
        </div>
        {items?.state === "open" ? (
          <ul className="grid gap-3">
            {items.items.map((i) => (
              <li key={i.sku}>
                <Link href={`/r/${token}/gifts/${encodeURIComponent(i.sku)}`} className="grid gap-1 rounded-lg border p-3 transition-colors hover:bg-muted">
                  <span className="font-medium">{i.name}</span>
                  <span className="text-xs text-muted-foreground">{i.brand}</span>
                  <Badge variant="secondary" className="w-fit">
                    {i.category}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <Notice title={t["redeem.error.unavailable"]} hint={t["redeem.error.unavailableHint"]} />
        )}
      </div>
    </Frame>
  );
}
