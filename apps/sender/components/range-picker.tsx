"use client";

import type { OverviewRange } from "@gifting/domain";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@gifting/ui/components/select";
import { CalendarIcon } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";

import { RANGE_LABELS } from "@/lib/overview";

/** The overview's date range, kept in the URL (`?range=`) so a view can be shared and survives a reload. */
export function RangePicker({ value }: { value: OverviewRange }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  return (
    <Select
      value={value}
      onValueChange={(next) => startTransition(() => router.replace(`${pathname}?range=${next}`, { scroll: false }))}
    >
      <SelectTrigger aria-label="Date range" className="min-w-40" aria-busy={pending}>
        <CalendarIcon />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {(Object.keys(RANGE_LABELS) as OverviewRange[]).map((r) => (
          <SelectItem key={r} value={r}>
            {RANGE_LABELS[r]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
