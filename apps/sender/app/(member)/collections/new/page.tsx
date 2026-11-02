import { CollectionBuilder } from "@/components/collection-builder";
import { getProducts } from "@/lib/api";

/** Build a collection. Opened from Collections, or from the send flow (`?from=send`), which it returns to. */
export default async function NewCollectionPage({ searchParams }: PageProps<"/collections/new">) {
  const raw = await searchParams;
  const products = await getProducts();
  return (
    <div className="grid gap-6 pt-4">
      <section className="grid gap-1">
        <h1 className="text-3xl font-semibold">Build a collection</h1>
        <p className="text-muted-foreground">Everyone in your company can send it. Recipients pick one gift, up to the budget.</p>
      </section>
      <CollectionBuilder products={products} returnTo={raw.from === "send" ? "send" : undefined} />
    </div>
  );
}
