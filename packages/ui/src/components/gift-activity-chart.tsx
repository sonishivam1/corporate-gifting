"use client";

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { type ChartConfig, ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from "@gifting/ui/components/chart";

// The same colours as the status donut: sent blue, opened amber, chosen green.
const config = {
  sent: { label: "Sent", color: "var(--chart-1)" },
  opened: { label: "Opened", color: "var(--warning)" },
  chose: { label: "Chose a gift", color: "var(--success)" },
} satisfies ChartConfig;

/** "28 Oct" from "2026-10-28", in UTC like the overview's days. */
const dayLabel = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

/** Gifts sent, opened and chosen per day, as three soft overlapping areas. */
function GiftActivityChart({ daily }: { daily: readonly { date: string; sent: number; opened: number; chose: number }[] }) {
  return (
    <ChartContainer config={config} className="aspect-auto h-64 w-full">
      <AreaChart data={[...daily]} margin={{ left: -16, right: 8, top: 8 }}>
        <defs>
          {(Object.keys(config) as (keyof typeof config)[]).map((key) => (
            <linearGradient key={key} id={`fill-${key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={`var(--color-${key})`} stopOpacity={0.25} />
              <stop offset="95%" stopColor={`var(--color-${key})`} stopOpacity={0.02} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} tickFormatter={dayLabel} />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={40} />
        <ChartTooltip cursor={false} content={<ChartTooltipContent labelFormatter={(value) => dayLabel(String(value))} indicator="dot" />} />
        <ChartLegend verticalAlign="top" content={<ChartLegendContent className="justify-end pt-0 pb-3" />} />
        {(Object.keys(config) as (keyof typeof config)[]).map((key) => (
          <Area key={key} dataKey={key} type="monotone" stroke={`var(--color-${key})`} strokeWidth={2} fill={`url(#fill-${key})`} dot={false} isAnimationActive={false} />
        ))}
      </AreaChart>
    </ChartContainer>
  );
}

export { GiftActivityChart };
