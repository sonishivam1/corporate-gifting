import { CheckIcon } from "lucide-react";
import type { ComponentProps } from "react";

import { cn } from "@gifting/ui/lib/utils";

/**
 * A selectable card: a button that shows when it is chosen. Use it for
 * one-of and many-of choices that need more than a label (a gift, a
 * collection, a channel, a person).
 */
function ChoiceCard({
  selected,
  indicator = true,
  className,
  children,
  ...props
}: Omit<ComponentProps<"button">, "type"> & { selected: boolean; indicator?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      data-slot="choice-card"
      className={cn(
        "relative flex w-full items-center gap-3 rounded-lg border bg-card p-3 text-left text-sm transition-colors outline-none",
        "hover:bg-muted/50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
        "disabled:pointer-events-none disabled:opacity-50",
        "aria-pressed:border-primary aria-pressed:bg-primary/5",
        className,
      )}
      {...props}
    >
      {children}
      {indicator ? (
        <span
          aria-hidden
          className={cn(
            "ml-auto flex size-5 shrink-0 items-center justify-center rounded-full border",
            selected ? "border-primary bg-primary text-primary-foreground" : "border-input",
          )}
        >
          {selected ? <CheckIcon className="size-3.5" /> : null}
        </span>
      ) : null}
    </button>
  );
}

export { ChoiceCard };
