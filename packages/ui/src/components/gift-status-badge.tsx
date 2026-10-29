import type { GiftStatus } from "@gifting/domain";

import { Badge } from "@gifting/ui/components/badge";
import { STATUS_TONE_CLASS, type StatusTone } from "@gifting/ui/lib/status-tone";
import { cn } from "@gifting/ui/lib/utils";

const TONE: Record<GiftStatus, StatusTone> = {
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

function GiftStatusBadge({ status, className }: { status: GiftStatus; className?: string }) {
  return (
    <Badge variant="secondary" className={cn(STATUS_TONE_CLASS[TONE[status]], className)}>
      {status.replace("_", " ")}
    </Badge>
  );
}

export { GiftStatusBadge };
