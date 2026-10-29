import type { CampaignDisplayStatus } from "@gifting/domain";

import { Badge } from "@gifting/ui/components/badge";
import { STATUS_TONE_CLASS, type StatusTone } from "@gifting/ui/lib/status-tone";
import { cn } from "@gifting/ui/lib/utils";

const STATUS: Record<CampaignDisplayStatus, { label: string; tone: StatusTone }> = {
  draft: { label: "Draft", tone: "neutral" },
  pending_approval: { label: "Needs approval", tone: "warning" },
  scheduled: { label: "Scheduled", tone: "neutral" },
  active: { label: "Active", tone: "info" },
  completed: { label: "Completed", tone: "success" },
  cancelled: { label: "Cancelled", tone: "muted" },
};

function CampaignStatusBadge({ status, className }: { status: CampaignDisplayStatus; className?: string }) {
  const { label, tone } = STATUS[status];
  return (
    <Badge variant="secondary" className={cn(STATUS_TONE_CLASS[tone], className)}>
      {label}
    </Badge>
  );
}

export { CampaignStatusBadge };
