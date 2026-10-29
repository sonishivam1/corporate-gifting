import { OCCASION_LABELS } from "@gifting/domain";
import { Alert, AlertDescription, AlertTitle } from "@gifting/ui/components/alert";
import { Button } from "@gifting/ui/components/button";
import { CampaignStatusBadge } from "@gifting/ui/components/campaign-status-badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@gifting/ui/components/card";
import { GiftStatusBadge } from "@gifting/ui/components/gift-status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@gifting/ui/components/table";
import { ChevronLeftIcon, ClockIcon } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { FunnelSegments } from "@/components/funnel";
import { ApiCallError, getCampaign, getCampaignGifts, getProducts } from "@/lib/api";
import { CHANNEL } from "@/lib/catalog";
import { money, pct, shortDate } from "@/lib/format";

import { DecisionButtons } from "./decision-buttons";

export default async function CampaignPage({ params }: PageProps<"/campaigns/[id]">) {
  const { id } = await params;
  const loaded = await Promise.all([getCampaign(id), getCampaignGifts(id), getProducts()]).catch((err: unknown) => {
    if (err instanceof ApiCallError && err.status === 404) notFound();
    throw err;
  });
  const [campaign, gifts, products] = loaded;
  const productName = new Map(products.map((p) => [p.sku, p.name]));
  const { funnel } = campaign;
  const pending = campaign.displayStatus === "pending_approval";
  const what =
    campaign.gift.kind === "collection" ? `${campaign.gift.label}, up to ${money(campaign.budgetCents)}` : campaign.gift.label;

  return (
    <div className="grid gap-6 pt-4">
      <div>
        <Button asChild variant="ghost" size="sm">
          <Link href="/campaigns">
            <ChevronLeftIcon /> All campaigns
          </Link>
        </Button>
      </div>

      <section className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-1">
          <p className="text-sm text-muted-foreground">
            {campaign.type === "scheduled" && campaign.sendAt ? `Scheduled for ${shortDate(campaign.sendAt)}` : "One-time"} ·{" "}
            {OCCASION_LABELS[campaign.greeting.occasion]}
          </p>
          <h1 className="text-3xl font-semibold">{campaign.name}</h1>
          <p className="text-muted-foreground">
            {what} · created {shortDate(campaign.createdAt)} by {campaign.createdByName} ·{" "}
            {campaign.channels.map((c) => CHANNEL[c].label).join(", ")}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <CampaignStatusBadge status={campaign.displayStatus} />
          {campaign.canDecide ? (
            <DecisionButtons campaignId={campaign.id} approveLabel={`Approve ${money(campaign.totalHoldCents)}`} />
          ) : null}
        </div>
      </section>

      {pending && !campaign.canDecide ? (
        <Alert>
          <ClockIcon />
          <AlertTitle>Waiting for {campaign.approval?.approverNames.join(" or ") || "an approver"}</AlertTitle>
          <AlertDescription>
            It&apos;s over the team&apos;s approval limit. Approving places a {money(campaign.budgetCents)} hold per gift and sends them.
          </AlertDescription>
        </Alert>
      ) : null}

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Gifts" value={String(funnel.total)} />
        <Stat label="Opened" value={String(funnel.opened)} />
        <Stat label="Chose a gift" value={`${funnel.chose}`} note={funnel.sent ? `${pct(funnel.chose, funnel.sent)}%` : undefined} />
        <Stat label="Spent" value={money(campaign.spentCents)} />
      </section>

      {funnel.total ? <FunnelSegments funnel={funnel} /> : null}

      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Recipient</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Channel</TableHead>
              <TableHead>Gift chosen</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {gifts.map((g) => {
              const channel = CHANNEL[g.channel];
              return (
                <TableRow key={g.id}>
                  <TableCell>
                    <span className="font-medium">{g.recipientName}</span>
                    {g.recipientEmail ? <span className="block text-xs text-muted-foreground">{g.recipientEmail}</span> : null}
                  </TableCell>
                  <TableCell>
                    <GiftStatusBadge status={g.status} />
                  </TableCell>
                  <TableCell>
                    <span className="flex items-center gap-1.5 whitespace-nowrap">
                      <channel.icon className="size-4 text-muted-foreground" aria-hidden />
                      {channel.label}
                    </span>
                  </TableCell>
                  <TableCell>
                    {g.chosenSku ? productName.get(g.chosenSku) ?? g.chosenSku : <span className="text-muted-foreground">–</span>}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl tabular-nums">
          {value}
          {note ? <span className="ml-1 text-sm font-normal text-muted-foreground">· {note}</span> : null}
        </CardTitle>
      </CardHeader>
    </Card>
  );
}
