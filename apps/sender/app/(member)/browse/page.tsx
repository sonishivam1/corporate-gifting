import { PRODUCT_CATEGORIES, productQuery } from "@gifting/domain";
import { Button } from "@gifting/ui/components/button";
import { Card, CardContent } from "@gifting/ui/components/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@gifting/ui/components/empty";
import { Input } from "@gifting/ui/components/input";
import { SearchIcon } from "lucide-react";
import Link from "next/link";

import { ProductCard } from "@/components/product-card";
import { getProducts } from "@/lib/api";
import { CATEGORY } from "@/lib/catalog";
import { plural } from "@/lib/format";

const BUDGET_CHOICES = [
  { value: undefined, label: "Any" },
  { value: 2500, label: "Up to $25" },
  { value: 5000, label: "Up to $50" },
  { value: 7500, label: "Up to $75" },
  { value: 10_000, label: "Up to $100" },
];

type Filters = { budget?: number; category?: string; q?: string };

function hrefWith(current: Filters, change: Filters): string {
  const next = { ...current, ...change };
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(next)) if (v) params.set(k, String(v));
  return params.size ? `/browse?${params}` : "/browse";
}

export default async function BrowsePage({ searchParams }: PageProps<"/browse">) {
  const raw = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  // Unknown values are dropped rather than refused: it's a shareable URL.
  const parsed = productQuery.safeParse({
    budget: one(raw.budget),
    category: one(raw.category),
    q: one(raw.q) || undefined,
  });
  const filters: Filters = parsed.success ? parsed.data : {};
  const products = await getProducts(filters);

  return (
    <div className="grid gap-6 pt-4">
      <section className="grid gap-1">
        <h1 className="text-3xl font-semibold">Browse gifts</h1>
        <p className="text-muted-foreground">Every gift ships straight from the brand that makes it.</p>
      </section>

      <Card>
        <CardContent className="grid gap-4">
          <FilterRow label="Budget">
            {BUDGET_CHOICES.map((b) => (
              <Chip key={b.label} href={hrefWith(filters, { budget: b.value })} active={filters.budget === b.value}>
                {b.label}
              </Chip>
            ))}
          </FilterRow>
          <FilterRow label="Category">
            <Chip href={hrefWith(filters, { category: undefined })} active={!filters.category}>
              All
            </Chip>
            {PRODUCT_CATEGORIES.map((c) => (
              <Chip key={c} href={hrefWith(filters, { category: c })} active={filters.category === c}>
                {CATEGORY[c].label}
              </Chip>
            ))}
          </FilterRow>
          <form action="/browse" className="flex max-w-md gap-2" role="search">
            {filters.budget ? <input type="hidden" name="budget" value={filters.budget} /> : null}
            {filters.category ? <input type="hidden" name="category" value={filters.category} /> : null}
            <Input name="q" type="search" placeholder="Search gifts or brands" aria-label="Search gifts" defaultValue={filters.q ?? ""} />
            <Button type="submit" variant="outline">
              <SearchIcon /> Search
            </Button>
          </form>
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground" aria-live="polite">
        {plural(products.length, "gift")}
      </p>

      {products.length ? (
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((p) => (
            <ProductCard key={p.key} product={p} />
          ))}
        </section>
      ) : (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SearchIcon />
            </EmptyMedia>
            <EmptyTitle>No gifts match these filters</EmptyTitle>
            <EmptyDescription>Try a higher budget or another category.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button asChild variant="outline" size="sm">
              <Link href="/browse">Clear filters</Link>
            </Button>
          </EmptyContent>
        </Empty>
      )}
    </div>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2 sm:grid-cols-[6rem_1fr] sm:items-center">
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function Chip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Button asChild size="sm" variant={active ? "default" : "outline"} className="rounded-full">
      <Link href={href} aria-current={active ? "true" : undefined} scroll={false}>
        {children}
      </Link>
    </Button>
  );
}
