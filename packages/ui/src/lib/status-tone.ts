// Status tones from docs/design/design-system.md#gift-status-colours, shared by
// the gift and campaign status badges.
export type StatusTone = "neutral" | "info" | "warning" | "success" | "muted";

export const STATUS_TONE_CLASS: Record<StatusTone, string> = {
  neutral: "bg-secondary text-secondary-foreground",
  info: "bg-info-soft text-info",
  warning: "bg-warning-soft text-warning",
  success: "bg-success-soft text-success",
  muted: "bg-muted text-muted-foreground",
};
