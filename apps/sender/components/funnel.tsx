import type { CampaignSummaryView } from "@gifting/domain";
import { cn } from "@gifting/ui/lib/utils";

import { pct } from "@/lib/format";

type Funnel = CampaignSummaryView["funnel"];

const STAGES: { key: keyof Funnel; label: string }[] = [
  { key: "sent", label: "Sent" },
  { key: "opened", label: "Opened" },
  { key: "chose", label: "Chose a gift" },
  { key: "shipped", label: "Shipped" },
  { key: "delivered", label: "Delivered" },
  { key: "expired", label: "Expired" },
];

export function FunnelBars({ funnel }: { funnel: Funnel }) {
  return (
    <div className="grid grid-cols-3 gap-4 sm:grid-cols-6">
      {STAGES.map(({ key, label }) => {
        const value = funnel[key];
        const share = pct(value, funnel.sent);
        return (
          <div key={key} className="grid gap-2">
            <div className="flex h-24 items-end rounded-md bg-muted">
              <div
                className={cn("w-full rounded-md", key === "expired" ? "bg-muted-foreground/40" : "bg-primary")}
                style={{ height: `${Math.max(key === "sent" && value ? 100 : share, 2)}%` }}
              />
            </div>
            <span className="text-xl font-semibold tabular-nums">{value}</span>
            <span className="text-xs text-muted-foreground">
              {label}
              {key !== "sent" && funnel.sent ? ` · ${share}%` : ""}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** One bar split by where each gift is now. */
export function FunnelSegments({ funnel }: { funnel: Funnel }) {
  const segments = [
    { label: "Delivered", value: funnel.delivered, className: "bg-primary" },
    { label: "Shipped", value: funnel.shipped - funnel.delivered, className: "bg-primary/75" },
    { label: "Chose, not shipped", value: funnel.chose - funnel.shipped, className: "bg-primary/50" },
    { label: "Opened", value: funnel.opened - funnel.chose, className: "bg-primary/30" },
    { label: "Not opened", value: funnel.sent - funnel.opened - funnel.expired, className: "bg-primary/15" },
    { label: "Expired or cancelled", value: funnel.expired, className: "bg-muted-foreground/40" },
    { label: "Not sent yet", value: funnel.total - funnel.sent, className: "bg-muted" },
  ];
  return (
    <div className="grid gap-2">
      <div className="flex h-3 overflow-hidden rounded-full bg-muted">
        {segments.map((s) =>
          s.value > 0 ? (
            <div key={s.label} className={s.className} style={{ width: `${(s.value / Math.max(funnel.total, 1)) * 100}%` }} />
          ) : null,
        )}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {segments.map((s) => (
          <span key={s.label} className="flex items-center gap-1.5">
            <span className={cn("size-2.5 rounded-sm", s.className)} />
            {s.label} {s.value}
          </span>
        ))}
      </div>
    </div>
  );
}
