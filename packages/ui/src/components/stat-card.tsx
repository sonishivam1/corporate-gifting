import { ArrowDownIcon, ArrowUpIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Card, CardContent } from "@gifting/ui/components/card";
import { cn } from "@gifting/ui/lib/utils";

const TONES = {
  primary: "bg-primary/10 text-primary",
  success: "bg-success-soft text-success",
  info: "bg-info-soft text-info",
  warning: "bg-warning-soft text-warning",
} as const;

export type StatChange = {
  /** For example "12%" or "8 pts". */
  value: string;
  direction: "up" | "down" | "flat";
  /** For example "vs previous 30 days". */
  label: string;
};

/**
 * One headline number on an overview: an icon in a soft tone, the label, the
 * value with an optional side note (a rate, say), the change against the
 * previous period, and an optional footer such as a progress bar.
 */
function StatCard({
  icon,
  tone = "primary",
  label,
  value,
  aside,
  change,
  children,
  className,
}: {
  icon: ReactNode;
  tone?: keyof typeof TONES;
  label: string;
  value: string;
  aside?: ReactNode;
  change?: StatChange;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("gap-0 py-5", className)}>
      <CardContent className="flex gap-4 px-5">
        <span aria-hidden="true" className={cn("grid size-11 shrink-0 place-items-center rounded-xl [&_svg]:size-5", TONES[tone])}>
          {icon}
        </span>
        <div className="grid min-w-0 flex-1 gap-1">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="flex items-baseline gap-2">
            <span className="font-heading text-2xl font-semibold tabular-nums">{value}</span>
            {aside ? <span className="text-sm font-medium text-success">{aside}</span> : null}
          </p>
          {change ? (
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              {change.direction === "flat" ? null : (
                <span className={cn("inline-flex items-center gap-0.5 font-medium", change.direction === "up" ? "text-success" : "text-destructive")}>
                  {change.direction === "up" ? <ArrowUpIcon className="size-3" /> : <ArrowDownIcon className="size-3" />}
                  {change.value}
                </span>
              )}
              <span>{change.direction === "flat" ? `No change ${change.label}` : change.label}</span>
            </p>
          ) : null}
          {children}
        </div>
      </CardContent>
    </Card>
  );
}

export { StatCard };
