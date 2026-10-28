import type { GiftStatus } from "@gifting/domain";

import { Badge } from "@gifting/ui/components/badge";
import { cn } from "@gifting/ui/lib/utils";

type Tone = "neutral" | "info" | "warning" | "success" | "muted";

const TONE: Record<GiftStatus, Tone> = {
  created: "neutral",
  pending_approval: "neutral",
  scheduled: "neutral",
  sent: "info",
  opened: "info",
  redeeming: "warning",
  redeemed: "success",
  shipped: "success",
  delivered: "success",
  expired: "muted",
  cancelled: "muted",
};

// Tones from docs/design/design-system.md#gift-status-colours, on top of shadcn's Badge.
const TONE_CLASS: Record<Tone, string> = {
  neutral: "bg-secondary text-secondary-foreground",
  info: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
  warning: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  success: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  muted: "bg-muted text-muted-foreground",
};

function GiftStatusBadge({ status, className }: { status: GiftStatus; className?: string }) {
  return (
    <Badge variant="secondary" className={cn(TONE_CLASS[TONE[status]], className)}>
      {status.replace("_", " ")}
    </Badge>
  );
}

export { GiftStatusBadge };
