"use client";

import { Cell, Label, Pie, PieChart } from "recharts";

import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@gifting/ui/components/chart";

/**
 * Where sent gifts are now, in the order a gift moves through them. One
 * distinct token each: info and chart-1 are the same blue, and chart-2 and
 * success are both green, so shipped borrows the purple of the product tiles.
 */
export const DONUT_STATUSES = {
  waiting: { label: "Waiting to open", color: "var(--chart-3)" },
  opened: { label: "Opened", color: "var(--warning)" },
  chose: { label: "Chose a gift", color: "var(--chart-1)" },
  shipped: { label: "Shipped", color: "var(--tile-home-foreground)" },
  delivered: { label: "Delivered", color: "var(--success)" },
  expired: { label: "Expired", color: "var(--destructive)" },
} satisfies ChartConfig;

export type DonutStatus = keyof typeof DONUT_STATUSES;

/** A donut of the gifts by status, the total in the middle, and a legend with counts and shares. */
function GiftStatusDonut({ counts }: { counts: Record<DonutStatus, number> }) {
  const keys = Object.keys(DONUT_STATUSES) as DonutStatus[];
  const total = keys.reduce((n, k) => n + counts[k], 0);
  const data = keys.map((k) => ({ status: k, count: counts[k], fill: `var(--color-${k})` })).filter((d) => d.count > 0);

  return (
    <div className="grid items-center gap-6 sm:grid-cols-[minmax(0,12rem)_1fr]">
      <ChartContainer config={DONUT_STATUSES} className="mx-auto aspect-square w-full max-w-48">
        <PieChart>
          <ChartTooltip cursor={false} content={<ChartTooltipContent nameKey="status" hideLabel />} />
          <Pie data={total ? data : [{ status: "none", count: 1, fill: "var(--muted)" }]} dataKey="count" nameKey="status" innerRadius="62%" strokeWidth={2} paddingAngle={total ? 1 : 0} isAnimationActive={false}>
            {(total ? data : [{ fill: "var(--muted)" }]).map((d, i) => (
              <Cell key={i} fill={d.fill} />
            ))}
            <Label
              content={({ viewBox }) =>
                viewBox && "cx" in viewBox ? (
                  <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                    <tspan x={viewBox.cx} y={viewBox.cy} className="fill-foreground font-heading text-2xl font-semibold">
                      {total}
                    </tspan>
                    <tspan x={viewBox.cx} y={(viewBox.cy ?? 0) + 20} className="fill-muted-foreground text-xs">
                      gifts sent
                    </tspan>
                  </text>
                ) : null
              }
            />
          </Pie>
        </PieChart>
      </ChartContainer>
      <ul className="grid gap-2 text-sm">
        {keys.map((k) => (
          <li key={k} className="flex items-center gap-3 border-b pb-2 last:border-0 last:pb-0">
            <span aria-hidden="true" className="size-3 shrink-0 rounded-sm" style={{ background: DONUT_STATUSES[k].color }} />
            <span className="flex-1 whitespace-nowrap">{DONUT_STATUSES[k].label}</span>
            <span className="font-medium tabular-nums">{counts[k]}</span>
            <span className="w-10 text-right text-muted-foreground tabular-nums">{total ? Math.round((counts[k] / total) * 100) : 0}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export { GiftStatusDonut };
