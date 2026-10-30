import { Check, Package, Truck } from "lucide-react";

import { getOrder } from "@/lib/api";
import { copy } from "@/lib/copy";
import { TOKEN_SHAPE } from "@/lib/link";

import { Frame, Notice } from "../../../_components/frame";

/** The confirmation. It asks the API for the order, so opening this address on an unused link shows nothing. */
export default async function Done({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const order = TOKEN_SHAPE.test(token) ? await getOrder(token) : null;
  const t = await copy(["redeem.privacy", "redeem.error.invalid", "redeem.error.invalidHint", "redeem.confirmation.title", "redeem.track.ordered", "redeem.track.orderedDetail", "redeem.track.shipped", "redeem.track.shippedDetail", "redeem.track.delivered", "redeem.track.deliveredDetail"]);

  if (order?.state !== "ordered") {
    return (
      <Frame privacy={t["redeem.privacy"]}>
        <Notice title={t["redeem.error.invalid"]} hint={t["redeem.error.invalidHint"]} />
      </Frame>
    );
  }
  const body = await copy(["redeem.confirmation.order"], { orderNumber: order.orderNumber });
  const reached = { ordered: 1, shipped: 2, delivered: 3 }[order.status];

  const steps = [
    { icon: <Check className="size-4" />, label: t["redeem.track.ordered"], detail: t["redeem.track.orderedDetail"] },
    { icon: <Package className="size-4" />, label: t["redeem.track.shipped"], detail: t["redeem.track.shippedDetail"] },
    { icon: <Truck className="size-4" />, label: t["redeem.track.delivered"], detail: t["redeem.track.deliveredDetail"] },
  ];

  return (
    <Frame privacy={t["redeem.privacy"]}>
      <div className="grid gap-5 px-6 py-10">
        <div className="grid justify-items-center gap-3 text-center">
          <div className="grid size-14 place-items-center rounded-full bg-primary/10 text-primary">
            <Check className="size-7" />
          </div>
          <h1 className="text-xl font-semibold">{t["redeem.confirmation.title"]}</h1>
          <p className="font-mono text-sm text-muted-foreground">{body["redeem.confirmation.order"]}</p>
        </div>
        <ol className="grid gap-3 rounded-lg bg-muted p-4 text-sm">
          {steps.map((s, i) => (
            <li key={s.label} className="flex items-center gap-3">
              <span className={`grid size-7 place-items-center rounded-full ${i < reached ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground"}`}>{s.icon}</span>
              <span>
                <span className="block font-medium">{s.label}</span>
                <span className="block text-xs text-muted-foreground">{s.detail}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>
    </Frame>
  );
}
