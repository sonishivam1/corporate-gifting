"use client";

import { collectionInput, collectionItems, type CollectionView, type ProductView, rulesFromInput } from "@gifting/domain";
import { Alert, AlertDescription, AlertTitle } from "@gifting/ui/components/alert";
import { Badge } from "@gifting/ui/components/badge";
import { Button } from "@gifting/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@gifting/ui/components/card";
import { ChoiceCard } from "@gifting/ui/components/choice-card";
import { Field, FieldDescription, FieldLabel } from "@gifting/ui/components/field";
import { Input } from "@gifting/ui/components/input";
import { ScrollArea } from "@gifting/ui/components/scroll-area";
import { Spinner } from "@gifting/ui/components/spinner";
import { Toggle } from "@gifting/ui/components/toggle";
import { ToggleGroup, ToggleGroupItem } from "@gifting/ui/components/toggle-group";
import { toast } from "@gifting/ui/lib/toast";
import { CircleAlertIcon, InfoIcon, SearchIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { saveCollectionAction } from "@/app/(member)/collections/actions";
import { CollectionMosaic, ProductArt } from "@/components/product-art";
import { BUDGETS } from "@/lib/catalog";
import { money, plural, priceLabel } from "@/lib/format";

const PREVIEW_ITEMS = 6;

/** Distinct values with how many products carry each, most common first. */
function tally(values: readonly string[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

const toggled = (set: ReadonlySet<string>, value: string) => {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
};

/**
 * Builds or edits a company collection (plan: build-your-own-collection.md):
 * picked products, brands and tags, up to a budget. The preview uses the same
 * rule the API does, on the live catalog the page loaded.
 */
export function CollectionBuilder({
  products,
  initial,
  returnTo,
}: {
  products: readonly ProductView[];
  initial?: CollectionView;
  /** "send": go back to a new campaign with this collection chosen. */
  returnTo?: "send";
}) {
  const router = useRouter();
  const [name, setName] = useState(initial?.name ?? "");
  const [band, setBand] = useState(initial?.budgetBandCents ?? 5000);
  const [tags, setTags] = useState<ReadonlySet<string>>(new Set(initial?.rules.tags));
  const [brands, setBrands] = useState<ReadonlySet<string>>(new Set(initial?.rules.brands));
  const [skus, setSkus] = useState<ReadonlySet<string>>(new Set([...(initial?.rules.skus ?? []), ...(initial?.rules.pinnedSkus ?? [])]));
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  const allBrands = useMemo(() => tally(products.map((p) => p.brand)), [products]);
  const allTags = useMemo(() => tally(products.flatMap((p) => p.tags)), [products]);
  const budgets = [...new Set([...BUDGETS, band])].sort((a, b) => a - b);

  const input = { name, budgetBandCents: band, rules: { tags: [...tags], brands: [...brands], skus: [...skus] } };
  const checked = collectionInput.safeParse(input);
  const fits = collectionItems(rulesFromInput(input), products, band);

  const q = query.trim().toLowerCase();
  const shown = q ? products.filter((p) => [p.name, p.brand, p.vendorName, ...p.tags].join(" ").toLowerCase().includes(q)) : products;
  const isPicked = (p: ProductView) => p.variants.some((v) => skus.has(v.sku));
  const pickedCount = products.filter(isPicked).length;

  function togglePick(p: ProductView) {
    const next = new Set(skus);
    const on = !isPicked(p);
    for (const v of p.variants) {
      if (on) next.add(v.sku);
      else next.delete(v.sku);
    }
    setSkus(next);
  }

  function save() {
    if (!checked.success) return setError(checked.error.issues[0]?.message ?? "Check the collection.");
    setError(null);
    startSaving(async () => {
      const result = await saveCollectionAction(checked.data, initial?.id);
      if (!result.ok) return setError(result.message);
      toast.success(initial ? `${result.data.name} saved` : `${result.data.name} is ready for everyone in your company`);
      router.push(returnTo === "send" ? `/campaigns/new?collection=${encodeURIComponent(result.data.id)}` : "/collections");
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem] lg:items-start">
      <div className="grid gap-6">
        <Card>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="collection-name">Name</FieldLabel>
              <Input id="collection-name" maxLength={120} placeholder="Team treats" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field>
              <FieldLabel id="band-label">Usual budget per gift</FieldLabel>
              <ToggleGroup
                type="single"
                variant="outline"
                value={String(band)}
                onValueChange={(v) => v && setBand(Number(v))}
                aria-labelledby="band-label"
                className="flex-wrap"
              >
                {budgets.map((b) => (
                  <ToggleGroupItem key={b} value={String(b)} className="tabular-nums">
                    {money(b)}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <FieldDescription>Senders can still pick another budget when they send it.</FieldDescription>
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pick products</CardTitle>
            <CardDescription>Recipients choose one. Every option of a picked product is included, up to the gift&apos;s budget.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                className="pl-8"
                placeholder="Search gifts, brands or tags"
                aria-label="Search gifts"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {plural(pickedCount, "product")} picked{q ? ` · ${shown.length} of ${plural(products.length, "gift")} match` : ""}
            </p>
            <ScrollArea className="h-96 rounded-lg border">
              <div className="grid gap-1 p-1">
                {shown.map((p) => (
                  <ChoiceCard key={p.key} selected={isPicked(p)} onClick={() => togglePick(p)} className="border-transparent">
                    <ProductArt category={p.category} imageUrl={p.imageUrl} sizes="3rem" className="size-12 shrink-0" />
                    <span className="grid min-w-0">
                      <span className="truncate font-medium">{p.name}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {p.brand} · {priceLabel(p)}
                      </span>
                    </span>
                  </ChoiceCard>
                ))}
                {shown.length === 0 ? <p className="p-3 text-sm text-muted-foreground">No gift matches “{query.trim()}”.</p> : null}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Add whole brands or tags</CardTitle>
            <CardDescription>Everything from a brand, or with a tag, joins the collection, including new products later.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Chips label="Brands" values={allBrands} selected={brands} onToggle={(v) => setBrands(toggled(brands, v))} />
            <Chips label="Tags" values={allTags} selected={tags} onToggle={(v) => setTags(toggled(tags, v))} />
          </CardContent>
        </Card>
      </div>

      <Card className="lg:sticky lg:top-20">
        <CardHeader>
          <CardTitle>{name.trim() || "Your collection"}</CardTitle>
          <CardDescription className="tabular-nums">
            {plural(fits.length, "gift")} fit {money(band)} today
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <CollectionMosaic categories={fits.slice(0, 4).map((p) => p.category)} />
          {fits.length ? (
            <ul className="grid gap-1 text-sm">
              {fits.slice(0, PREVIEW_ITEMS).map((p) => (
                <li key={p.key} className="flex justify-between gap-2">
                  <span className="truncate">{p.name}</span>
                  <span className="shrink-0 text-muted-foreground tabular-nums">{priceLabel(p)}</span>
                </li>
              ))}
              {fits.length > PREVIEW_ITEMS ? <li className="text-muted-foreground">and {fits.length - PREVIEW_ITEMS} more</li> : null}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              {skus.size + brands.size + tags.size ? "Nothing you picked is in stock at this budget." : "Pick products, brands or tags to fill it."}
            </p>
          )}
          {initial ? (
            <Alert>
              <InfoIcon />
              <AlertDescription>Changes reach gifts already sent and not yet chosen. Their budgets don&apos;t change.</AlertDescription>
            </Alert>
          ) : null}
          {error ? (
            <Alert variant="destructive">
              <CircleAlertIcon />
              <AlertTitle>Not saved</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <div className="flex gap-2">
            <Button className="flex-1" onClick={save} disabled={saving}>
              {saving ? <Spinner /> : null}
              {initial ? "Save changes" : "Save collection"}
            </Button>
            <Button variant="outline" onClick={() => router.back()} disabled={saving}>
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Chips({
  label,
  values,
  selected,
  onToggle,
}: {
  label: string;
  values: readonly [string, number][];
  selected: ReadonlySet<string>;
  onToggle: (value: string) => void;
}) {
  return (
    <div className="grid gap-2">
      <span className="text-sm font-medium">
        {label}
        {selected.size ? <Badge variant="secondary" className="ml-2">{selected.size} chosen</Badge> : null}
      </span>
      <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto">
        {values.map(([value, count]) => (
          <Toggle key={value} variant="outline" size="sm" pressed={selected.has(value)} onPressedChange={() => onToggle(value)} className="rounded-full">
            {value} <span className="text-muted-foreground tabular-nums">{count}</span>
          </Toggle>
        ))}
      </div>
    </div>
  );
}
