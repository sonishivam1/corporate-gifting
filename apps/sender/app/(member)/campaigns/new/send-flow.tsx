"use client";

import {
  type BalanceView,
  type CollectionView,
  type EstimateView,
  findVariant,
  type MeView,
  type ProductView,
  type RecipientImportView,
  type RecipientListView,
  type RecipientView,
  type SubmitResultView,
  variantName,
} from "@gifting/domain";
import { Button } from "@gifting/ui/components/button";
import { Card, CardContent } from "@gifting/ui/components/card";
import { GreetingCard } from "@gifting/ui/components/greeting-card";
import { Spinner } from "@gifting/ui/components/spinner";
import { toast } from "@gifting/ui/lib/toast";
import { cn } from "@gifting/ui/lib/utils";
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";

import { estimateAction, sendAction } from "@/app/(member)/campaigns/actions";
import { ChannelIcons } from "@/components/channel-icons";
import { CHANNEL } from "@/lib/catalog";
import { money, plural } from "@/lib/format";

import { Done } from "./done";
import { type Draft, initialDraft, perGiftCents, recipientCount, STEPS, stepProblem, toSendInput } from "./draft";
import { GiftStep, GreetingStep, RecipientsStep, ReviewStep } from "./steps";

type Props = {
  me: MeView;
  balance: BalanceView;
  collections: CollectionView[];
  products: ProductView[];
  recipients: RecipientListView;
  start: { sku?: string; collectionId?: string };
};

export function SendFlow({ me, balance, collections, products, recipients, start }: Props) {
  const [draft, setDraft] = useState<Draft>(() => initialDraft({ fromName: me.user.name, collections, start }));
  const [step, setStep] = useState(0);
  // One key per open flow: a double click or a retry reuses the same campaign.
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [estimate, setEstimate] = useState<{ for: string; value: EstimateView | null; error: string | null } | null>(null);
  const [result, setResult] = useState<SubmitResultView | null>(null);
  const [sending, startSending] = useTransition();
  // The directory's first page, plus anyone found by a search or uploaded in this flow.
  const [directory, setDirectory] = useState<RecipientView[]>(recipients.recipients);

  const addToDirectory = useCallback((people: readonly RecipientView[]) => {
    setDirectory((current) => {
      const known = new Set(current.map((r) => r.id));
      const fresh = people.filter((r) => !known.has(r.id));
      return fresh.length ? [...current, ...fresh].sort((a, b) => a.name.localeCompare(b.name)) : current;
    });
  }, []);

  /** Uploaded people join the list and are ticked for this campaign. */
  function onImported({ recipients: added }: RecipientImportView) {
    addToDirectory(added);
    setDraft((d) => ({ ...d, recipientIds: [...new Set([...d.recipientIds, ...added.map((r) => r.id)])] }));
  }

  const update = (change: Partial<Draft>) => setDraft((d) => ({ ...d, ...change }));
  const input = useMemo(() => toSendInput(draft), [draft]);
  const inputKey = JSON.stringify(input);
  const problem = stepProblem(step, draft, collections, products);
  const current = estimate?.for === inputKey ? estimate : null;

  // Price the send on the server whenever the review step shows a new draft.
  useEffect(() => {
    if (step !== 3) return;
    let live = true;
    void estimateAction(input).then((r) => {
      if (live) setEstimate({ for: inputKey, value: r.ok ? r.data : null, error: r.ok ? null : r.message });
    });
    return () => {
      live = false;
    };
  }, [step, inputKey, input]);

  const picked = draft.sku ? findVariant(products, draft.sku) : null;
  const giftLabel =
    draft.mode === "single"
      ? picked
        ? variantName(picked.product, picked.variant)
        : "No gift picked"
      : `${collections.find((c) => c.id === draft.collectionId)?.name ?? "Collection"}, up to ${money(draft.budgetCents)}`;

  function submit() {
    startSending(async () => {
      const r = await sendAction(input, idempotencyKey);
      if (r.ok) {
        setResult(r.data);
        window.scrollTo({ top: 0 });
      } else {
        toast.error(r.message);
        // The balance may have changed under us: price it again.
        setEstimate(null);
        if (r.code === "insufficient_funds") void estimateAction(input).then((e) => setEstimate({ for: inputKey, value: e.ok ? e.data : null, error: e.ok ? null : e.message }));
      }
    });
  }

  function reset() {
    setDraft(initialDraft({ fromName: me.user.name, collections, start: {} }));
    setStep(0);
    setEstimate(null);
    setResult(null);
    setIdempotencyKey(crypto.randomUUID());
  }

  if (result) {
    return (
      <Done
        result={result}
        sendAt={draft.when === "later" ? draft.sendAt : null}
        channels={draft.channels.map((c) => CHANNEL[c].label).join(", ")}
        approverNames={me.team.approverNames}
        onAnother={reset}
      />
    );
  }

  const n = recipientCount(draft);
  const hold = n * perGiftCents(draft, products);
  const nextLabel =
    step < 3
      ? "Continue"
      : current?.value?.needsApproval
        ? "Submit for approval"
        : draft.when === "later"
          ? `Schedule ${plural(n, "gift")}`
          : `Send ${plural(n, "gift")}`;
  const canSubmit = step === 3 && !!current?.value && !current.value.short && !sending;

  return (
    <div className="grid gap-6 pt-4">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-1">
          <p className="text-sm text-muted-foreground">New campaign · {me.team.name} team</p>
          <h1 className="text-3xl font-semibold">Send a gift</h1>
        </div>
        <Button asChild variant="ghost">
          <Link href="/campaigns">Cancel</Link>
        </Button>
      </section>

      <nav aria-label="Steps">
        <ol className="flex flex-wrap gap-2">
          {STEPS.map((label, i) => (
            <li key={label}>
              <button
                type="button"
                disabled={i > step}
                aria-current={i === step ? "step" : undefined}
                onClick={() => setStep(i)}
                className={cn(
                  "flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors disabled:opacity-60",
                  i === step ? "border-primary bg-primary/5 font-medium" : "hover:bg-muted/50",
                )}
              >
                <span
                  className={cn(
                    "flex size-5 items-center justify-center rounded-full text-xs",
                    i < step ? "bg-primary text-primary-foreground" : i === step ? "bg-primary/15 text-primary" : "bg-muted",
                  )}
                >
                  {i < step ? <CheckIcon className="size-3" /> : i + 1}
                </span>
                {label}
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_20rem]">
        <Card>
          <CardContent className="grid gap-8">
            {step === 0 ? <GiftStep draft={draft} update={update} collections={collections} products={products} /> : null}
            {step === 1 ? <GreetingStep draft={draft} update={update} /> : null}
            {step === 2 ? <RecipientsStep
                draft={draft}
                update={update}
                recipients={directory}
                more={recipients.more}
                onFound={addToDirectory}
                onImported={onImported}
              /> : null}
            {step === 3 ? (
              <ReviewStep
                draft={draft}
                update={update}
                me={me}
                giftLabel={giftLabel}
                estimate={current?.value ?? null}
                estimateError={current?.error ?? null}
                goTo={setStep}
              />
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
              <Button variant="outline" disabled={step === 0 || sending} onClick={() => setStep((s) => s - 1)}>
                <ChevronLeftIcon /> Back
              </Button>
              <div className="flex flex-wrap items-center gap-3">
                {problem ? <span className="text-sm text-muted-foreground">{problem}</span> : null}
                {step < 3 ? (
                  <Button disabled={!!problem} onClick={() => setStep((s) => s + 1)}>
                    {nextLabel} <ChevronRightIcon />
                  </Button>
                ) : (
                  <Button disabled={!canSubmit} onClick={submit}>
                    {sending ? <Spinner /> : null} {nextLabel}
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <aside className="grid gap-3 lg:sticky lg:top-4" aria-label="Summary">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">What they&apos;ll see</p>
          <GreetingCard
            cover={draft.cover}
            headline={draft.headline}
            message={draft.message}
            from={`From ${draft.fromName || "…"}, ${me.company.name}`}
          />
          <Card className="gap-2 py-4 text-sm">
            <CardContent className="grid gap-2">
              <Row label="Gift" value={giftLabel} />
              <Row label="Recipients" value={String(n)} />
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Channels</span>
                <ChannelIcons channels={draft.channels} />
              </div>
              <Row label="Hold at send" value={money(current?.value?.totalCents ?? hold)} />
              <Row label="Available now" value={money(balance.availableCents)} />
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <b className="text-right tabular-nums">{value}</b>
    </div>
  );
}
