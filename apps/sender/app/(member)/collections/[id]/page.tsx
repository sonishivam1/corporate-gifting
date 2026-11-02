import { notFound } from "next/navigation";

import { CollectionBuilder } from "@/components/collection-builder";
import { getCollection, getProducts } from "@/lib/api";

/** Edit one of the company's collections. Platform and archived collections are "not found". */
export default async function EditCollectionPage({ params }: PageProps<"/collections/[id]">) {
  const { id } = await params;
  const [collection, products] = await Promise.all([getCollection(id), getProducts()]);
  if (!collection || collection.owner === "platform") notFound();
  return (
    <div className="grid gap-6 pt-4">
      <section className="grid gap-1">
        <h1 className="text-3xl font-semibold">Edit {collection.name}</h1>
        <p className="text-muted-foreground">Shared with everyone in your company.</p>
      </section>
      <CollectionBuilder products={products} initial={collection} />
    </div>
  );
}
