import { Button } from "@gifting/ui/components/button";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { getItems } from "@/lib/api";
import { copy } from "@/lib/copy";
import { TOKEN_SHAPE } from "@/lib/link";

import { Frame, Notice } from "../../../_components/frame";
import { guard } from "../../../_components/guard";
import { ShipForm } from "./[sku]/ship-form";

/** Where to send a bundle: every gift goes in one order, to one address (plan: gift-bundles.md). */
export default async function ShipBundle({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const g = await guard(token);
  if (!g.ok) return g.page;

  const t = await copy([
    "redeem.privacy", "redeem.bundle.title", "redeem.bundle.soldOut", "redeem.bundle.soldOutHint", "redeem.address.yourGifts", "redeem.address.title", "redeem.address.name",
    "redeem.address.line1", "redeem.address.line2", "redeem.address.city", "redeem.address.state", "redeem.address.stateChoose", "redeem.address.zip", "redeem.address.usOnly",
    "redeem.address.submit", "redeem.address.submitting", "redeem.address.errorField", "redeem.address.errorZip", "redeem.address.errorState", "redeem.error.tryAgain",
    "redeem.error.used", "redeem.error.unavailable",
  ]);

  const back = (
    <div className="border-b px-3 py-2">
      <Button variant="ghost" size="sm" asChild>
        <Link href={`/r/${token}`}>
          <ArrowLeft /> {t["redeem.bundle.title"]}
        </Link>
      </Button>
    </div>
  );

  const items = TOKEN_SHAPE.test(token) ? await getItems(token) : null;
  // Only a bundle with every gift in stock is claimed here; anything else goes back to the gift page.
  if (!items || items.state !== "open" || !items.bundle || !items.allInStock) {
    return (
      <Frame privacy={t["redeem.privacy"]}>
        {back}
        <Notice title={t["redeem.bundle.soldOut"]} hint={t["redeem.bundle.soldOutHint"]} />
      </Frame>
    );
  }

  return (
    <Frame privacy={t["redeem.privacy"]}>
      {back}
      <ShipForm
        token={token}
        sku={null}
        itemName={items.items.map((i) => i.name).join(", ")}
        copy={{
          yourGift: t["redeem.address.yourGifts"], soldOut: t["redeem.bundle.soldOut"], title: t["redeem.address.title"], name: t["redeem.address.name"], line1: t["redeem.address.line1"],
          line2: t["redeem.address.line2"], city: t["redeem.address.city"], state: t["redeem.address.state"], stateChoose: t["redeem.address.stateChoose"], zip: t["redeem.address.zip"],
          usOnly: t["redeem.address.usOnly"], submit: t["redeem.address.submit"], submitting: t["redeem.address.submitting"], errorField: t["redeem.address.errorField"],
          errorZip: t["redeem.address.errorZip"], errorState: t["redeem.address.errorState"], tryAgain: t["redeem.error.tryAgain"], used: t["redeem.error.used"], unavailable: t["redeem.error.unavailable"],
        }}
      />
    </Frame>
  );
}
