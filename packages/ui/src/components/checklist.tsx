import { Check, Circle } from "lucide-react";

import { cn } from "cn";

/**
 * A live list of rules and whether each is met, for example the password
 * rules under a password field. Met items turn green with a tick; screen
 * readers hear "met" or "not met" with each.
 */
function Checklist({ items, className, ...props }: { items: { id: string; label: string; met: boolean }[]; className?: string; id?: string }) {
  return (
    <ul className={cn("grid gap-1 text-xs", className)} {...props}>
      {items.map((item) => (
        <li key={item.id} className={cn("flex items-center gap-1.5", item.met ? "text-success" : "text-muted-foreground")}>
          {item.met ? <Check aria-hidden="true" className="size-3.5" /> : <Circle aria-hidden="true" className="size-3" />}
          <span>
            {item.label}
            <span className="sr-only">{item.met ? " (met)" : " (not met)"}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export { Checklist };
