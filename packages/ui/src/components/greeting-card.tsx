import type { CardCover } from "@gifting/domain";

import { cn } from "@gifting/ui/lib/utils";

/** Card covers, drawn from theme tokens so the company colour (--primary) carries through. */
export const COVER_CLASS: Record<CardCover, string> = {
  confetti: "bg-primary/10 bg-[radial-gradient(var(--primary)_1.5px,transparent_1.5px)] bg-size-[14px_14px] text-foreground",
  ribbon:
    "bg-secondary bg-[linear-gradient(90deg,transparent_44%,var(--primary)_44%,var(--primary)_56%,transparent_56%)] text-foreground",
  evergreen: "bg-accent bg-[repeating-linear-gradient(135deg,transparent_0_12px,var(--border)_12px_14px)] text-accent-foreground",
  brand: "bg-primary text-primary-foreground",
};

/** What the recipient sees first: the cover, the headline, the message and who it's from. */
function GreetingCard({
  cover,
  headline,
  message,
  from,
  className,
}: {
  cover: CardCover;
  headline: string;
  message: string;
  from: string;
  className?: string;
}) {
  return (
    <div className={cn("overflow-hidden rounded-xl border bg-card shadow-sm", className)}>
      <div className={cn("flex aspect-[2/1] items-end p-4", COVER_CLASS[cover])}>
        <span className="rounded-md bg-background/85 px-2 py-1 text-lg font-semibold text-foreground">{headline || " "}</span>
      </div>
      <div className="grid gap-3 p-4 text-sm">
        <p className="whitespace-pre-line">{message}</p>
        <p className="text-muted-foreground">{from}</p>
      </div>
    </div>
  );
}

export { GreetingCard };
