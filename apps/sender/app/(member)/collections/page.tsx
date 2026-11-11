import type { CollectionView } from "@gifting/domain";
import { Badge } from "@gifting/ui/components/badge";
import { Button } from "@gifting/ui/components/button";
import { Card, CardContent, CardFooter } from "@gifting/ui/components/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@gifting/ui/components/empty";
import { LayersIcon, PencilIcon, PlusIcon } from "lucide-react";
import Link from "next/link";

import { ArchiveCollection } from "@/components/archive-collection";
import { CollectionMosaic } from "@/components/product-art";
import { allowed, getCollections } from "@/lib/api";
import { money, plural } from "@/lib/format";

/** The company's own collections, which owners, admins and senders can change, and the platform's. */
export default async function CollectionsPage() {
  const [collections, canManage] = await Promise.all([getCollections(), allowed("collection:manage")]);
  const own = collections.filter((c) => c.owner !== "platform");
  const platform = collections.filter((c) => c.owner === "platform");

  return (
    <div className="grid gap-8 pt-4">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-1">
          <h1 className="text-3xl font-semibold">Collections</h1>
          <p className="text-muted-foreground">Gifts people choose from, up to a budget. Your company&apos;s collections are shared with everyone in it.</p>
        </div>
        {canManage ? (
          <Button asChild>
            <Link href="/collections/new">
              <PlusIcon /> Build a collection
            </Link>
          </Button>
        ) : null}
      </section>

      <section className="grid gap-3" aria-labelledby="own-collections">
        <h2 id="own-collections" className="text-lg font-semibold">
          Your company&apos;s collections
        </h2>
        {own.length ? (
          <Grid>
            {own.map((c) => (
              <CollectionCard key={c.id} collection={c}>
                {canManage ? (
                  <>
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/collections/${encodeURIComponent(c.id)}`}>
                        <PencilIcon /> Edit
                      </Link>
                    </Button>
                    <ArchiveCollection id={c.id} name={c.name} />
                  </>
                ) : null}
              </CollectionCard>
            ))}
          </Grid>
        ) : (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <LayersIcon />
              </EmptyMedia>
              <EmptyTitle>No collections of your own yet</EmptyTitle>
              <EmptyDescription>Pick products, brands or tags, set a budget, and everyone in your company can send it.</EmptyDescription>
            </EmptyHeader>
            {canManage ? (
              <EmptyContent>
                <Button asChild size="sm">
                  <Link href="/collections/new">
                    <PlusIcon /> Build a collection
                  </Link>
                </Button>
              </EmptyContent>
            ) : null}
          </Empty>
        )}
      </section>

      <section className="grid gap-3" aria-labelledby="platform-collections">
        <h2 id="platform-collections" className="text-lg font-semibold">
          Ready-made collections
        </h2>
        <Grid>
          {platform.map((c) => (
            <CollectionCard key={c.id} collection={c} />
          ))}
        </Grid>
      </section>
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>;
}

function CollectionCard({ collection: c, children }: { collection: CollectionView; children?: React.ReactNode }) {
  const rules = c.rules.tags.length + c.rules.brands.length;
  const picked = c.rules.skus.length;
  return (
    <Card className="gap-3">
      <CardContent className="grid gap-3">
        <CollectionMosaic categories={c.previewCategories} />
        <div className="grid gap-1">
          <span className="font-medium">{c.name}</span>
          <span className="text-sm text-muted-foreground">
            Up to {money(c.budgetBandCents)} · {plural(c.itemCount, "gift")} · {plural(c.brandCount, "brand")}
          </span>
        </div>
        {children ? (
          <div className="flex flex-wrap gap-1.5">
            {picked ? <Badge variant="secondary">{plural(picked, "picked option")}</Badge> : null}
            {rules ? <Badge variant="secondary">{plural(rules, "tag or brand", "tags and brands")}</Badge> : null}
            {c.itemCount === 0 ? <Badge variant="outline">Nothing in stock at this budget</Badge> : null}
          </div>
        ) : null}
      </CardContent>
      {children ? <CardFooter className="gap-2">{children}</CardFooter> : null}
    </Card>
  );
}
