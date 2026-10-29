"use client";

import {
  CARD_COVERS,
  CHANNEL_KINDS,
  type CollectionView,
  type EstimateView,
  EXPIRY_DAYS,
  type MeView,
  OCCASION_LABELS,
  OCCASIONS,
  type ProductView,
  type RecipientView,
} from "@gifting/domain";
import { Alert, AlertDescription, AlertTitle } from "@gifting/ui/components/alert";
import { Avatar, AvatarFallback } from "@gifting/ui/components/avatar";
import { Badge } from "@gifting/ui/components/badge";
import { Button } from "@gifting/ui/components/button";
import { ChoiceCard } from "@gifting/ui/components/choice-card";
import { Field, FieldDescription, FieldError, FieldLabel } from "@gifting/ui/components/field";
import { COVER_CLASS } from "@gifting/ui/components/greeting-card";
import { Input } from "@gifting/ui/components/input";
import { NativeSelect, NativeSelectOption } from "@gifting/ui/components/native-select";
import { ScrollArea } from "@gifting/ui/components/scroll-area";
import { Separator } from "@gifting/ui/components/separator";
import { Skeleton } from "@gifting/ui/components/skeleton";
import { Switch } from "@gifting/ui/components/switch";
import { Textarea } from "@gifting/ui/components/textarea";
import { ToggleGroup, ToggleGroupItem } from "@gifting/ui/components/toggle-group";
import { cn } from "@gifting/ui/lib/utils";
import { CalendarIcon, CircleAlertIcon, GiftIcon, InfoIcon, LayersIcon, SearchIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { z } from "zod";

import { CollectionMosaic, ProductArt } from "@/components/product-art";
import { BUDGETS, CHANNEL } from "@/lib/catalog";
import { LET_THEM_CHOOSE } from "@/lib/features";
import { money, plural, shortDate } from "@/lib/format";

import { type Draft, HEADLINES, itemsFor, recipientCount, tomorrow } from "./draft";

type Update = (change: Partial<Draft>) => void;

function Section({ title, aside, children }: { title: React.ReactNode; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function GiftStep({
  draft,
  update,
  collections,
  products,
}: {
  draft: Draft;
  update: Update;
  collections: readonly CollectionView[];
  products: readonly ProductView[];
}) {
  const budgets = [...new Set([...BUDGETS, draft.budgetCents])].sort((a, b) => a - b);
  return (
    <div className="grid gap-6">
      <h2 className="text-xl font-semibold">What are you sending?</h2>
      {LET_THEM_CHOOSE ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <ChoiceCard selected={draft.mode === "collection"} onClick={() => update({ mode: "collection" })} indicator={false}>
            <LayersIcon className="size-5 shrink-0 text-primary" />
            <span className="grid gap-0.5">
              <span className="font-medium">Let them choose</span>
              <span className="text-muted-foreground">They pick one gift from a collection, up to your budget.</span>
            </span>
          </ChoiceCard>
          <ChoiceCard selected={draft.mode === "single"} onClick={() => update({ mode: "single" })} indicator={false}>
            <GiftIcon className="size-5 shrink-0 text-primary" />
            <span className="grid gap-0.5">
              <span className="font-medium">One specific gift</span>
              <span className="text-muted-foreground">Everyone gets the same item. They still add their own address.</span>
            </span>
          </ChoiceCard>
        </div>
      ) : null}

      {LET_THEM_CHOOSE && draft.mode === "collection" ? (
        <>
          <Section title="Budget per gift">
            <ToggleGroup
              type="single"
              variant="outline"
              value={String(draft.budgetCents)}
              onValueChange={(v) => v && update({ budgetCents: Number(v) })}
              aria-label="Budget per gift"
              className="flex-wrap"
            >
              {budgets.map((b) => (
                <ToggleGroupItem key={b} value={String(b)} className="tabular-nums">
                  {money(b)}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </Section>
          <Section title="Collection">
            <div className="grid gap-2 sm:grid-cols-2">
              {collections.map((c) => {
                const items = itemsFor({ ...draft, collectionId: c.id }, collections, products);
                return (
                  <ChoiceCard
                    key={c.id}
                    selected={draft.collectionId === c.id}
                    disabled={items.length === 0}
                    onClick={() => update({ collectionId: c.id })}
                  >
                    <CollectionMosaic categories={items.slice(0, 4).map((i) => i.category)} className="w-20 shrink-0" />
                    <span className="grid">
                      <span className="font-medium">{c.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {plural(items.length, "gift")} fit {money(draft.budgetCents)}
                      </span>
                    </span>
                  </ChoiceCard>
                );
              })}
            </div>
          </Section>
        </>
      ) : (
        <Section title={LET_THEM_CHOOSE ? "Pick the gift" : "Pick the gift everyone gets"}>
          <div className="grid gap-2 sm:grid-cols-2">
            {products.map((p) => (
              <ChoiceCard key={p.sku} selected={draft.sku === p.sku} onClick={() => update({ sku: p.sku })}>
                <ProductArt category={p.category} className="size-12 shrink-0" />
                <span className="grid min-w-0">
                  <span className="text-xs text-muted-foreground uppercase">{p.brand}</span>
                  <span className="truncate font-medium">{p.name}</span>
                  <span className="text-xs tabular-nums">{money(p.priceCents)}</span>
                </span>
              </ChoiceCard>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

export function GreetingStep({ draft, update }: { draft: Draft; update: Update }) {
  return (
    <div className="grid gap-6">
      <h2 className="text-xl font-semibold">Write the greeting</h2>
      <Section title="Occasion">
        <ToggleGroup
          type="single"
          variant="outline"
          value={draft.occasion}
          onValueChange={(v) => {
            if (!v) return;
            const occasion = v as Draft["occasion"];
            // Keep a headline the sender wrote; replace one we suggested.
            const suggested = draft.headline === HEADLINES[draft.occasion];
            update({ occasion, ...(suggested ? { headline: HEADLINES[occasion] } : {}) });
          }}
          aria-label="Occasion"
          className="flex-wrap"
        >
          {OCCASIONS.map((o) => (
            <ToggleGroupItem key={o} value={o}>
              {OCCASION_LABELS[o]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Section>
      <Section title="Card design">
        <div className="flex gap-3" role="radiogroup" aria-label="Card design">
          {CARD_COVERS.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={draft.cover === c}
              aria-label={c === "brand" ? "Company colour" : c[0]!.toUpperCase() + c.slice(1)}
              onClick={() => update({ cover: c })}
              className={cn(
                "size-14 rounded-lg border-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                COVER_CLASS[c],
                draft.cover === c ? "border-primary" : "border-transparent",
              )}
            />
          ))}
        </div>
      </Section>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="headline">Headline</FieldLabel>
          <Input id="headline" maxLength={40} value={draft.headline} onChange={(e) => update({ headline: e.target.value })} />
        </Field>
        <Field>
          <FieldLabel htmlFor="from">From</FieldLabel>
          <Input id="from" maxLength={40} value={draft.fromName} onChange={(e) => update({ fromName: e.target.value })} />
        </Field>
      </div>
      <Field>
        <FieldLabel htmlFor="message">Message</FieldLabel>
        <Textarea id="message" rows={5} maxLength={500} value={draft.message} onChange={(e) => update({ message: e.target.value })} />
        <FieldDescription className="tabular-nums">{draft.message.length} / 500</FieldDescription>
      </Field>
    </div>
  );
}

const emailSchema = z.email();

export function RecipientsStep({ draft, update, recipients }: { draft: Draft; update: Update; recipients: readonly RecipientView[] }) {
  const [query, setQuery] = useState("");
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const q = query.trim().toLowerCase();
  const shown = q ? recipients.filter((r) => `${r.name} ${r.email ?? ""}`.toLowerCase().includes(q)) : recipients;
  const allPicked = draft.recipientIds.length === recipients.length;

  const toggle = (id: string) =>
    update({
      recipientIds: draft.recipientIds.includes(id) ? draft.recipientIds.filter((x) => x !== id) : [...draft.recipientIds, id],
    });

  const toggleChannel = (c: Draft["channels"][number]) =>
    update({ channels: draft.channels.includes(c) ? draft.channels.filter((x) => x !== c) : [...draft.channels, c] });

  function addEmail() {
    const value = email.trim().toLowerCase();
    if (!emailSchema.safeParse(value).success) return setEmailError("Enter an email address like name@company.example.");
    const inDirectory = recipients.find((r) => r.email?.toLowerCase() === value);
    if (inDirectory) {
      if (!draft.recipientIds.includes(inDirectory.id)) update({ recipientIds: [...draft.recipientIds, inDirectory.id] });
    } else if (!draft.newEmails.includes(value)) {
      update({ newEmails: [...draft.newEmails, value] });
    }
    setEmail("");
    setEmailError(null);
  }

  return (
    <div className="grid gap-6">
      <h2 className="text-xl font-semibold">Who gets it, and how?</h2>
      <Section
        title={
          <>
            Recipients <span className="font-normal text-muted-foreground">· {recipientCount(draft)} selected</span>
          </>
        }
        aside={
          <Button
            variant="outline"
            size="sm"
            onClick={() => update({ recipientIds: allPicked ? [] : recipients.map((r) => r.id) })}
          >
            {allPicked ? "Clear all" : "Select all"}
          </Button>
        }
      >
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            className="pl-8"
            placeholder="Search the directory"
            aria-label="Search the directory"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <ScrollArea className="h-72 rounded-lg border">
          <div className="grid gap-1 p-1">
            {shown.length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground">Nobody in the directory matches. Add them by email below.</p>
            ) : (
              shown.map((r) => (
                <ChoiceCard key={r.id} selected={draft.recipientIds.includes(r.id)} onClick={() => toggle(r.id)} className="border-transparent">
                  <Avatar className="size-8">
                    <AvatarFallback>{r.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}</AvatarFallback>
                  </Avatar>
                  <span className="grid min-w-0">
                    <span className="font-medium">{r.name}</span>
                    <span className="truncate text-xs text-muted-foreground">{r.email}</span>
                  </span>
                </ChoiceCard>
              ))
            )}
          </div>
        </ScrollArea>
        <Field data-invalid={emailError ? true : undefined}>
          <FieldLabel htmlFor="add-email">Add someone by email</FieldLabel>
          <div className="flex gap-2">
            <Input
              id="add-email"
              type="email"
              placeholder="name@company.example"
              value={email}
              aria-invalid={emailError ? true : undefined}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addEmail();
                }
              }}
            />
            <Button variant="outline" onClick={addEmail}>
              Add
            </Button>
          </div>
          {emailError ? <FieldError>{emailError}</FieldError> : null}
        </Field>
        {draft.newEmails.length ? (
          <div className="flex flex-wrap gap-2">
            {draft.newEmails.map((e) => (
              <Badge key={e} variant="secondary" className="gap-1 pr-1">
                {e}
                <button
                  type="button"
                  aria-label={`Remove ${e}`}
                  className="rounded-sm hover:bg-muted"
                  onClick={() => update({ newEmails: draft.newEmails.filter((x) => x !== e) })}
                >
                  <XIcon className="size-3.5" />
                </button>
              </Badge>
            ))}
          </div>
        ) : null}
      </Section>

      <Section title="Delivery">
        <p className="-mt-1 text-sm text-muted-foreground">
          Pick one or more. Each person gets the first direct channel you pick; links and QR codes are for you to hand out.
        </p>
        <div className="grid gap-2 sm:grid-cols-3">
          {CHANNEL_KINDS.map((c) => {
            const channel = CHANNEL[c];
            return (
              <ChoiceCard key={c} selected={draft.channels.includes(c)} onClick={() => toggleChannel(c)}>
                <channel.icon className="size-5 shrink-0 text-primary" />
                <span className="grid">
                  <span className="font-medium">{channel.label}</span>
                  <span className="text-xs text-muted-foreground">{channel.note}</span>
                </span>
              </ChoiceCard>
            );
          })}
        </div>
      </Section>

      <div className="grid gap-6 sm:grid-cols-2">
        <Section title="When">
          <ToggleGroup
            type="single"
            variant="outline"
            value={draft.when}
            onValueChange={(v) => v && update({ when: v as Draft["when"] })}
            aria-label="When to send"
          >
            <ToggleGroupItem value="now">Send now</ToggleGroupItem>
            <ToggleGroupItem value="later">
              <CalendarIcon /> Schedule
            </ToggleGroupItem>
          </ToggleGroup>
          {draft.when === "later" ? (
            <Input
              type="date"
              aria-label="Send date"
              min={tomorrow()}
              value={draft.sendAt}
              onChange={(e) => update({ sendAt: e.target.value })}
              className="w-fit"
            />
          ) : null}
        </Section>
        <Field>
          <FieldLabel htmlFor="expiry">Expires after</FieldLabel>
          <NativeSelect
            id="expiry"
            value={draft.expiresInDays}
            onChange={(e) => update({ expiresInDays: Number(e.target.value) as Draft["expiresInDays"] })}
          >
            {EXPIRY_DAYS.map((d) => (
              <NativeSelectOption key={d} value={d}>
                {d} days
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
      </div>

      <Field orientation="horizontal" className="justify-between">
        <div className="grid gap-0.5">
          <FieldLabel htmlFor="reminders">Reminders</FieldLabel>
          <FieldDescription>Nudge on day 3 and day 7 until they choose.</FieldDescription>
        </div>
        <Switch id="reminders" checked={draft.reminders} onCheckedChange={(v) => update({ reminders: v })} />
      </Field>
    </div>
  );
}

export function ReviewStep({
  draft,
  update,
  me,
  giftLabel,
  estimate,
  estimateError,
  goTo,
}: {
  draft: Draft;
  update: Update;
  me: MeView;
  giftLabel: string;
  estimate: EstimateView | null;
  estimateError: string | null;
  goTo: (step: number) => void;
}) {
  const n = recipientCount(draft);
  const sendDate = draft.when === "later" ? draft.sendAt : new Date().toISOString().slice(0, 10);
  const rows: { label: string; value: string; step: number }[] = [
    { label: "Gift", value: giftLabel, step: 0 },
    { label: "Greeting", value: `${draft.headline} · from ${draft.fromName}`, step: 1 },
    { label: "Recipients", value: plural(n, "person", "people"), step: 2 },
    {
      label: "Delivery",
      value: `${draft.channels.map((c) => CHANNEL[c].label).join(", ")} · ${draft.when === "now" ? "now" : `on ${shortDate(draft.sendAt)}`}`,
      step: 2,
    },
    { label: "Expiry", value: `${draft.expiresInDays} days${draft.reminders ? ", with reminders" : ""}`, step: 2 },
  ];

  return (
    <div className="grid gap-6">
      <h2 className="text-xl font-semibold">Review and send</h2>
      <Field>
        <FieldLabel htmlFor="campaign-name">Campaign name</FieldLabel>
        <Input
          id="campaign-name"
          maxLength={120}
          placeholder={`${OCCASION_LABELS[draft.occasion]} · ${shortDate(sendDate)}`}
          value={draft.name}
          onChange={(e) => update({ name: e.target.value })}
        />
      </Field>
      <dl className="grid divide-y rounded-lg border">
        {rows.map((r) => (
          <div key={r.label} className="grid grid-cols-[6rem_1fr_auto] items-center gap-3 px-3 py-2 text-sm">
            <dt className="text-muted-foreground">{r.label}</dt>
            <dd className="min-w-0 truncate">{r.value}</dd>
            <Button variant="ghost" size="sm" onClick={() => goTo(r.step)}>
              Edit
            </Button>
          </div>
        ))}
      </dl>

      {estimateError ? (
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertTitle>We couldn&apos;t price this send</AlertTitle>
          <AlertDescription>{estimateError}</AlertDescription>
        </Alert>
      ) : !estimate ? (
        <div className="grid gap-2 rounded-lg bg-muted/50 p-4" aria-busy>
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-5 w-3/4" />
        </div>
      ) : (
        <>
          <div className="grid gap-2 rounded-lg bg-muted/50 p-4 text-sm tabular-nums">
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">
                {plural(estimate.gifts, "gift")} × {draft.mode === "single" ? "price" : "budget"} {money(estimate.holdCents - estimate.estimateCents)}
                {estimate.estimateCents > 0 ? ` + ${money(estimate.estimateCents)} estimated shipping and tax` : ""}
              </span>
              <b>{money(estimate.totalCents)}</b>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">{me.team.name} budget available now</span>
              <span>{money(estimate.availableCents)}</span>
            </div>
            <Separator />
            <div className="flex justify-between gap-4 font-semibold">
              <span>Available after this send</span>
              <span>{money(estimate.afterCents)}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              We hold this amount when gifts go out. When someone chooses, we charge the real cost, including shipping and tax,
              and release the rest. If the real cost is higher, the difference comes out of the team budget.
              Gifts nobody opens release their hold when they expire.
            </p>
          </div>
          {estimate.short ? (
            <Alert variant="destructive">
              <CircleAlertIcon />
              <AlertTitle>
                The {me.team.name} budget is {money(estimate.shortByCents)} short.
              </AlertTitle>
              <AlertDescription>Top up the team or send to fewer people.</AlertDescription>
            </Alert>
          ) : estimate.needsApproval ? (
            <Alert>
              <InfoIcon />
              <AlertTitle>This send needs approval.</AlertTitle>
              <AlertDescription>
                It&apos;s over the {me.team.name} team&apos;s {money(estimate.approvalThresholdCents)} limit, so{" "}
                {estimate.approverNames.join(" or ") || "an approver"} will be asked to approve it. Nothing is held until then.
              </AlertDescription>
            </Alert>
          ) : null}
        </>
      )}
    </div>
  );
}
