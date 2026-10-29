import { OVERVIEW_RANGES, type OverviewRange } from "@gifting/domain";
import { Badge } from "@gifting/ui/components/badge";
import { Button } from "@gifting/ui/components/button";
import { CampaignStatusBadge } from "@gifting/ui/components/campaign-status-badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@gifting/ui/components/card";
import { GiftActivityChart } from "@gifting/ui/components/gift-activity-chart";
import { GiftStatusDonut } from "@gifting/ui/components/gift-status-donut";
import { Progress } from "@gifting/ui/components/progress";
import { type StatChange, StatCard } from "@gifting/ui/components/stat-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@gifting/ui/components/table";
import {
  ChevronRightIcon,
  ClockIcon,
  GiftIcon,
  GridIcon,
  HandHeartIcon,
  LayersIcon,
  type LucideIcon,
  RepeatIcon,
  SendIcon,
  WalletIcon,
} from "lucide-react";
import Link from "next/link";

import { CollectionMosaic } from "@/components/product-art";
import { RangePicker } from "@/components/range-picker";
import { getCampaigns, getCollections, getMe, getOverview, getProducts, getWorkspace } from "@/lib/api";
import { LET_THEM_CHOOSE } from "@/lib/features";
import { money, pct, plural } from "@/lib/format";
import { RANGE_LABELS } from "@/lib/overview";

function greeting(now = new Date()) {
  const h = now.getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

/** The change in a count against the previous period, as a percentage. */
function countChange(now: number, before: number, label: string): StatChange | undefined {
  if (before === 0) return now === 0 ? { value: "", direction: "flat", label } : undefined;
  const change = Math.round(((now - before) / before) * 100);
  return { value: `${Math.abs(change)}%`, direction: change > 0 ? "up" : change < 0 ? "down" : "flat", label };
}

/** The change in a rate against the previous period, in percentage points. */
function rateChange(now: number, before: number, hadBefore: boolean, label: string): StatChange | undefined {
  if (!hadBefore) return undefined;
  const change = now - before;
  return { value: `${Math.abs(change)} pts`, direction: change > 0 ? "up" : change < 0 ? "down" : "flat", label };
}

export default async function Home({ searchParams }: PageProps<"/">) {
  const raw = (await searchParams).range;
  const range: OverviewRange = OVERVIEW_RANGES.includes(raw as OverviewRange) ? (raw as OverviewRange) : "30d";
  const [me, account] = await Promise.all([getWorkspace(), getMe()]);
  // Greet the signed-in person; the workspace's development user only if their name is missing.
  const firstName = (account.kind === "account" ? account.me.firstName : null) ?? me.user.name.split(" ")[0];
  const [overview, campaigns, collections, products] = await Promise.all([
    getOverview(me.team.key, range),
    getCampaigns("all", 5),
    getCollections(),
    getProducts(),
  ]);
  const { balance, sent, chose } = overview;
  const funded = balance.availableCents + balance.heldCents + balance.spentCents;
  const used = pct(balance.heldCents + balance.spentCents, funded);
  const vs = `vs previous ${RANGE_LABELS[range].replace("Last ", "")}`;
  const brands = new Set(products.map((p) => p.brand)).size;

  return (
    <div className="grid gap-6 pt-6">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-1">
          <p className="text-sm text-muted-foreground">
            {me.company.name} · {me.team.name} team
          </p>
          <h1 className="text-3xl font-semibold">
            {greeting()}, {firstName}
          </h1>
          <p className="text-muted-foreground">
            You have <b className="text-foreground tabular-nums">{money(balance.availableCents)}</b> to give
            {overview.pendingApprovals ? (
              <>
                {" "}
                and{" "}
                <Link href="/campaigns?status=pending_approval" className="font-medium text-primary underline-offset-4 hover:underline">
                  {plural(overview.pendingApprovals, "send")} waiting for approval
                </Link>
              </>
            ) : null}
            .
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <RangePicker value={range} />
          <Button asChild variant="outline">
            <Link href="/browse">
              <GridIcon /> Browse gifts
            </Link>
          </Button>
          <Button asChild>
            <Link href="/campaigns/new">
              <SendIcon /> Send a gift
            </Link>
          </Button>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="At a glance">
        <StatCard icon={<WalletIcon />} tone="primary" label="Available to send" value={money(balance.availableCents)}>
          <Progress value={used} aria-label={`${used}% of the budget is held or spent`} className="mt-2" />
          <p className="text-xs text-muted-foreground">
            {money(balance.heldCents)} held · {money(balance.spentCents)} spent
          </p>
        </StatCard>
        <StatCard icon={<GiftIcon />} tone="info" label="Gifts sent" value={String(sent.count)} change={countChange(sent.count, sent.previous, vs)} />
        <StatCard
          icon={<HandHeartIcon />}
          tone="success"
          label="Chose a gift"
          value={String(chose.count)}
          aside={sent.count ? `${chose.rate}%` : undefined}
          change={rateChange(chose.rate, chose.previousRate, sent.previous > 0, vs)}
        />
        <StatCard icon={<ClockIcon />} tone="warning" label="Expiring soon" value={String(overview.expiringSoon)}>
          <p className="text-xs text-muted-foreground">Links expiring in the next 7 days</p>
        </StatCard>
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Gift activity</CardTitle>
            <CardDescription>Sent, opened and chosen per day · {RANGE_LABELS[range].toLowerCase()}</CardDescription>
          </CardHeader>
          <CardContent>
            <GiftActivityChart daily={overview.daily} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Gift status</CardTitle>
            <CardDescription>Gifts sent in this period, by where they are now</CardDescription>
          </CardHeader>
          <CardContent>
            <GiftStatusDonut counts={overview.statuses} />
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" aria-label="Quick actions">
        <Action href="/campaigns/new" icon={SendIcon} title="Send a gift" text="Pick a gift, write a note, choose how it arrives." lead />
        <Action href="/browse" icon={GridIcon} title="Browse gifts" text={`${plural(products.length, "gift")} from ${plural(brands, "brand")}.`} />
        <Action icon={LayersIcon} title="Build a collection" text="Let people pick anything up to a budget." />
        <Action icon={RepeatIcon} title="Automate moments" text="Birthdays, anniversaries and first days." />
        <Action icon={WalletIcon} title="Top up budget" text="By card or invoice, straight into this team." />
      </section>

      {/* Collections lead into "Let them choose", hidden for now. */}
      {LET_THEM_CHOOSE ? (
        <section className="grid gap-3">
          <h2 className="text-lg font-semibold">Your collections</h2>
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
                View all <ChevronRightIcon />
              </Link>
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          {campaigns.campaigns.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No campaigns yet.{" "}
              <Link className="text-primary underline-offset-4 hover:underline" href="/campaigns/new">
                Send your first gift
              </Link>
              .
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campaign</TableHead>
                  <TableHead className="hidden md:table-cell">Gift</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Gifts</TableHead>
                  <TableHead className="hidden w-48 lg:table-cell">Chose a gift</TableHead>
                  <TableHead className="hidden text-right md:table-cell">Spent</TableHead>
                  <TableHead className="w-0">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.campaigns.map((c) => {
                  const rate = pct(c.funnel.chose, c.funnel.sent);
                  return (
                    <TableRow key={c.id}>
                      <TableCell>
                        <span className="grid">
                          <span className="font-medium">{c.name}</span>
                          <span className="text-xs text-muted-foreground capitalize">{c.type.replace("-", " ")}</span>
                        </span>
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground md:table-cell">{c.gift.label}</TableCell>
                      <TableCell>
                        <CampaignStatusBadge status={c.displayStatus} />
                      </TableCell>
                      <TableCell className="hidden text-right tabular-nums sm:table-cell">{c.funnel.total}</TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <span className="flex items-center gap-2">
                          <Progress value={rate} aria-label={`${rate}% chose a gift`} className="flex-1" />
                          <span className="w-9 text-right text-sm tabular-nums">{c.funnel.sent ? `${rate}%` : "–"}</span>
                        </span>
                      </TableCell>
                      <TableCell className="hidden text-right tabular-nums md:table-cell">{money(c.spentCents)}</TableCell>
                      <TableCell>
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/campaigns/${c.id}`} aria-label={`View ${c.name}`}>
                            View
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/** A compact quick-action card. Without `href` the action isn't built yet and shows "Soon". */
function Action({ href, icon: Icon, title, text, lead }: { href?: string; icon: LucideIcon; title: string; text: string; lead?: boolean }) {
  const body = (
    <Card className={`h-full gap-2 py-4 transition-colors ${lead ? "bg-primary text-primary-foreground hover:bg-primary/90" : href ? "hover:bg-muted/50" : "opacity-70"}`}>
      <CardHeader className="gap-1 px-4">
        <span className="flex items-center justify-between">
          <Icon className={`size-6 ${lead ? "" : "text-primary"}`} />
          {href ? null : <Badge variant="secondary">Soon</Badge>}
        </span>
        <CardTitle className="mt-1 flex items-center gap-1 text-sm">
          {title} {href ? <ChevronRightIcon className="size-4" /> : null}
        </CardTitle>
        <CardDescription className={`text-xs ${lead ? "text-primary-foreground/80" : ""}`}>{text}</CardDescription>
      </CardHeader>
    </Card>
  );
  return href ? (
    <Link href={href} className="rounded-xl focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
      {body}
    </Link>
  ) : (
    <div aria-disabled="true">{body}</div>
  );
}
