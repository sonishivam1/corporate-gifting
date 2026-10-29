import { Button } from "@gifting/ui/components/button";
import { CampaignStatusBadge } from "@gifting/ui/components/campaign-status-badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@gifting/ui/components/card";
import { Progress } from "@gifting/ui/components/progress";
import { ChevronRightIcon, GridIcon, SendIcon } from "lucide-react";
import Link from "next/link";

import { CollectionMosaic } from "@/components/product-art";
import { getBalance, getCampaigns, getCollections, getWorkspace, getProducts } from "@/lib/api";
import { LET_THEM_CHOOSE } from "@/lib/features";
import { money, pct, plural } from "@/lib/format";

function greeting(now = new Date()) {
  const h = now.getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export default async function Home() {
  const me = await getWorkspace();
  const [balance, campaigns, collections, products] = await Promise.all([
    getBalance(me.team.key),
    getCampaigns("all", 4),
    getCollections(),
    getProducts(),
  ]);
  const pending = campaigns.counts.pending_approval;
  const brands = new Set(products.map((p) => p.brand)).size;

  return (
    <div className="grid gap-8 pt-4">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-1">
          <p className="text-sm text-muted-foreground">
            {me.company.name} · {me.team.name} team
          </p>
          <h1 className="text-3xl font-semibold">
            {greeting()}, {me.user.name.split(" ")[0]}
          </h1>
          <p className="text-muted-foreground">
            You have <b className="text-foreground tabular-nums">{money(balance.availableCents)}</b> to give
            {pending ? ` and ${plural(pending, "send")} waiting for approval` : ""}.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/browse">
              <GridIcon /> Browse gifts
            </Link>
          </Button>
          <Button asChild size="lg">
            <Link href="/campaigns/new">
              <SendIcon /> Send a gift
            </Link>
          </Button>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2" aria-label="Quick actions">
        <Link href="/campaigns/new" className="rounded-xl focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
          <Card className="h-full bg-primary text-primary-foreground transition-opacity hover:opacity-90">
            <CardHeader>
              <SendIcon className="mb-2 size-8" />
              <CardTitle className="flex items-center gap-1">
                Send a gift <ChevronRightIcon className="size-4" />
              </CardTitle>
              <CardDescription className="text-primary-foreground/80">
                Pick a gift, write a note, choose how it arrives.
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>
        <Link href="/browse" className="rounded-xl focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
          <Card className="h-full transition-colors hover:bg-muted/50">
            <CardHeader>
              <GridIcon className="mb-2 size-8 text-primary" />
              <CardTitle className="flex items-center gap-1">
                Browse gifts <ChevronRightIcon className="size-4" />
              </CardTitle>
              <CardDescription>
                {plural(products.length, "gift")} from {plural(brands, "brand")}.
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>
      </section>

      <section className="grid gap-4 sm:grid-cols-3" aria-label="Budget">
        <Stat label="Available to send" value={money(balance.availableCents)} lead />
        <Stat label="Held for gifts not yet chosen" value={money(balance.heldCents)} />
        <Stat label="Spent on chosen gifts" value={money(balance.spentCents)} />
      </section>

      {/* Collections lead into "Let them choose", hidden for now. */}
      {LET_THEM_CHOOSE ? (
        <section className="grid gap-3">
          <h2 className="text-lg font-semibold">Collections</h2>
          <div className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
            {collections.map((c) => (
              <Link
                key={c.id}
                href={`/campaigns/new?collection=${encodeURIComponent(c.id)}`}
                className="w-52 shrink-0 snap-start rounded-xl focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <Card className="h-full gap-3 py-3 transition-colors hover:bg-muted/50">
                  <CardContent className="grid gap-3 px-3">
                    <CollectionMosaic categories={c.previewCategories} />
                    <div className="grid">
                      <span className="font-medium">{c.name}</span>
                      <span className="text-xs text-muted-foreground">
                        Up to {money(c.budgetBandCents)} · {plural(c.itemCount, "gift")}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Recent campaigns</CardTitle>
          <CardAction>
            <Button asChild variant="ghost" size="sm">
              <Link href="/campaigns">
                All <ChevronRightIcon />
              </Link>
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="grid gap-1">
          {campaigns.campaigns.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No campaigns yet. <Link className="text-primary underline-offset-4 hover:underline" href="/campaigns/new">Send your first gift</Link>.
            </p>
          ) : (
            campaigns.campaigns.map((c) => {
              const chose = pct(c.funnel.chose, c.funnel.sent);
              return (
                <Link
                  key={c.id}
                  href={`/campaigns/${c.id}`}
                  className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 rounded-md px-2 py-2 hover:bg-muted/50 sm:grid-cols-[1fr_auto_8rem_3rem]"
                >
                  <span className="grid">
                    <span className="font-medium">{c.name}</span>
                    <span className="text-xs text-muted-foreground">{plural(c.funnel.total, "gift")}</span>
                  </span>
                  <CampaignStatusBadge status={c.displayStatus} />
                  <Progress value={chose} aria-label={`${chose}% chose a gift`} className="hidden sm:block" />
                  <span className="hidden text-right text-sm tabular-nums sm:block">{c.funnel.sent ? `${chose}%` : "–"}</span>
                </Link>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, lead }: { label: string; value: string; lead?: boolean }) {
  return (
    <Card className={lead ? "border-primary/40" : undefined}>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}
