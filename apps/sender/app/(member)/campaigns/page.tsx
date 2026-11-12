import { campaignListQuery } from "@gifting/domain";
import { Badge } from "@gifting/ui/components/badge";
import { Button } from "@gifting/ui/components/button";
import { CampaignStatusBadge } from "@gifting/ui/components/campaign-status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@gifting/ui/components/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@gifting/ui/components/table";
import { ChevronRightIcon, PlusIcon } from "lucide-react";
import Link from "next/link";

import { ChannelIcons } from "@/components/channel-icons";
import { FunnelBars } from "@/components/funnel";
import { getCampaigns, getWorkspace } from "@/lib/api";
import { money, pct, shortDate } from "@/lib/format";

const TABS = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "scheduled", label: "Scheduled" },
  { key: "pending_approval", label: "Needs approval" },
] as const;

export default async function CampaignsPage({ searchParams }: PageProps<"/campaigns">) {
  const raw = await searchParams;
  const { status } = campaignListQuery.catch({ status: "all", limit: 100 }).parse({ status: raw.status });
  const [me, list] = await Promise.all([getWorkspace(), getCampaigns(status)]);
  // The top bar's search: campaign names containing the words, in this team's list.
  const q = typeof raw.q === "string" ? raw.q.trim().slice(0, 100) : "";
  const shown = q ? list.campaigns.filter((c) => c.name.toLowerCase().includes(q.toLowerCase())) : list.campaigns;

  return (
    <div className="grid gap-6 pt-4">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-1">
          <p className="text-sm text-muted-foreground">{me.team.name} team</p>
          <h1 className="text-3xl font-semibold">Campaigns</h1>
        </div>
        {me.actions.includes("campaign:create") ? (
          <Button asChild>
            <Link href="/campaigns/new">
              <PlusIcon /> New campaign
            </Link>
          </Button>
        ) : null}
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Gift funnel</CardTitle>
          <CardDescription>All {me.team.name} campaigns that have gone out</CardDescription>
        </CardHeader>
        <CardContent>
          <FunnelBars funnel={list.funnel} />
        </CardContent>
      </Card>

      <section className="grid gap-3">
        <nav className="flex flex-wrap gap-1" aria-label="Filter campaigns">
          {TABS.map((t) => (
            <Button key={t.key} asChild size="sm" variant={status === t.key ? "secondary" : "ghost"}>
              <Link
                href={t.key === "all" ? "/campaigns" : `/campaigns?status=${t.key}`}
                aria-current={status === t.key ? "page" : undefined}
                scroll={false}
              >
                {t.label}
                <Badge variant="outline" className="tabular-nums">
                  {list.counts[t.key]}
                </Badge>
              </Link>
            </Button>
          ))}
        </nav>

        {q ? (
          <p className="text-sm text-muted-foreground">
            {shown.length} {shown.length === 1 ? "campaign matches" : "campaigns match"} &ldquo;{q}&rdquo;.{" "}
            <Link href={status === "all" ? "/campaigns" : `/campaigns?status=${status}`} className="text-primary underline-offset-4 hover:underline">
              Clear search
            </Link>
          </p>
        ) : null}

        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campaign</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Gifts</TableHead>
                <TableHead className="text-right">Chose</TableHead>
                <TableHead className="text-right">Spend</TableHead>
                <TableHead>Channels</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                    {q ? "No campaigns match your search." : "No campaigns here yet."}
                  </TableCell>
                </TableRow>
              ) : (
                shown.map((c) => (
                  <TableRow key={c.id} className="relative">
                    <TableCell>
                      {/* The link covers the row, so the whole row is clickable. */}
                      <Link href={`/campaigns/${c.id}`} className="font-medium after:absolute after:inset-0">
                        {c.name}
                      </Link>
                      <span className="block text-xs text-muted-foreground">
                        {c.type === "scheduled" && c.sendAt ? `Scheduled · ${shortDate(c.sendAt)}` : "One-time"} ·{" "}
                        {money(c.budgetCents)} each
                      </span>
                    </TableCell>
                    <TableCell>
                      <CampaignStatusBadge status={c.displayStatus} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{c.funnel.total}</TableCell>
                    <TableCell className="text-right whitespace-nowrap tabular-nums">
                      {c.funnel.sent ? `${c.funnel.chose} · ${pct(c.funnel.chose, c.funnel.sent)}%` : "–"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{money(c.spentCents)}</TableCell>
                    <TableCell>
                      <ChannelIcons channels={c.channels} />
                    </TableCell>
                    <TableCell>
                      <ChevronRightIcon className="size-4 text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      </section>
    </div>
  );
}
