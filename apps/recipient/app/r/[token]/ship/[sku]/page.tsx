import { Button } from "@gifting/ui/components/button";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { getItem } from "@/lib/api";
import { copy } from "@/lib/copy";
import { TOKEN_SHAPE } from "@/lib/link";

import { Frame, Notice } from "../../../../_components/frame";
import { guard } from "../../../../_components/guard";
import { ShipForm } from "./ship-form";

/** Where to send it. The gift was chosen on its own page. */
export default async function Ship({ params }: { params: Promise<{ token: string; sku: string }> }) {
  const { token, sku: rawSku } = await params;
  const sku = decodeURIComponent(rawSku);
  const g = await guard(token);
  if (!g.ok) return g.page;

  const t = await copy([
    "redeem.privacy", "redeem.item.back", "redeem.error.itemGone", "redeem.error.itemGoneHint", "redeem.address.yourGift", "redeem.address.title", "redeem.address.name",
    "redeem.address.line1", "redeem.address.line2", "redeem.address.city", "redeem.address.state", "redeem.address.stateChoose", "redeem.address.zip", "redeem.address.usOnly",
    "redeem.address.submit", "redeem.address.submitting", "redeem.address.errorField", "redeem.address.errorZip", "redeem.address.errorState", "redeem.error.tryAgain",
    "redeem.error.used", "redeem.error.unavailable",
  ]);

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

  return (
    <Frame privacy={t["redeem.privacy"]}>
      <div className="border-b px-3 py-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/r/${token}/gifts/${encodeURIComponent(sku)}`}>
            <ArrowLeft /> {found.item.name}
          </Link>
        </Button>
      </div>
      <ShipForm
        token={token}
        sku={sku}
        itemName={found.item.name}
        copy={{
          yourGift: t["redeem.address.yourGift"], title: t["redeem.address.title"], name: t["redeem.address.name"], line1: t["redeem.address.line1"], line2: t["redeem.address.line2"],
          city: t["redeem.address.city"], state: t["redeem.address.state"], stateChoose: t["redeem.address.stateChoose"], zip: t["redeem.address.zip"], usOnly: t["redeem.address.usOnly"],
          submit: t["redeem.address.submit"], submitting: t["redeem.address.submitting"], errorField: t["redeem.address.errorField"], errorZip: t["redeem.address.errorZip"],
          errorState: t["redeem.address.errorState"], tryAgain: t["redeem.error.tryAgain"], used: t["redeem.error.used"], unavailable: t["redeem.error.unavailable"],
        }}
      />
    </Frame>
  );
}
