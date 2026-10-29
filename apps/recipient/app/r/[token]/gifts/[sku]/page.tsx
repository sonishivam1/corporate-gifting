import { Button } from "@gifting/ui/components/button";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { getItem } from "@/lib/api";
import { copy } from "@/lib/copy";
import { TOKEN_SHAPE } from "@/lib/link";

import { Frame, Notice } from "../../../../_components/frame";
import { guard } from "../../../../_components/guard";

/** One gift on its own page. */
export default async function GiftPage({ params }: { params: Promise<{ token: string; sku: string }> }) {
  const { token, sku: rawSku } = await params;
  const sku = decodeURIComponent(rawSku);
  const g = await guard(token);
  if (!g.ok) return g.page;

  const t = await copy(["redeem.privacy", "redeem.item.back", "redeem.item.choose", "redeem.item.shipping", "redeem.error.itemGone", "redeem.error.itemGoneHint"]);
  const found = TOKEN_SHAPE.test(token) ? await getItem(token, sku) : null;
  if (!found || found.state !== "open") {
    return (
      <Frame privacy={t["redeem.privacy"]}>
        <Notice title={t["redeem.error.itemGone"]} hint={t["redeem.error.itemGoneHint"]} />
        <div className="px-6 pb-8 text-center">
          <Button variant="outline" asChild>
            <Link href={`/r/${token}`}>{t["redeem.item.back"]}</Link>
          </Button>
        </div>
      </Frame>
    );
  }
  const { item } = found;
  return (
    <Frame privacy={t["redeem.privacy"]}>
      <div className="border-b px-3 py-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/r/${token}`}>
            <ArrowLeft /> {t["redeem.item.back"]}
          </Link>
        </Button>
      </div>
      <div className="grid gap-4 p-6">
        <div>
          <p className="text-xs text-muted-foreground">{item.brand}</p>
          <h1 className="text-xl font-semibold">{item.name}</h1>
        </div>
        <p className="text-sm">{item.description}</p>
        <p className="text-xs text-muted-foreground">{t["redeem.item.shipping"]}</p>
        <Button asChild size="lg">
          <Link href={`/r/${token}/ship/${encodeURIComponent(item.sku)}`}>{t["redeem.item.choose"]}</Link>
        </Button>
      </div>
    </Frame>
  );
}
