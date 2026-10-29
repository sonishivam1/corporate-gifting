import type { ProductCategory } from "@gifting/domain";
import { cn } from "@gifting/ui/lib/utils";

import { CATEGORY } from "@/lib/catalog";

// The seed products have no photos yet; a category icon stands in.
export function ProductArt({ category, className }: { category: ProductCategory; className?: string }) {
  const { icon: Icon, tile } = CATEGORY[category];
  return (
    <div className={cn("flex items-center justify-center rounded-lg", tile, className)} aria-hidden>
      <Icon className="size-1/3 max-h-14 max-w-14" strokeWidth={1.5} />
    </div>
  );
}

export function CollectionMosaic({ categories, className }: { categories: readonly ProductCategory[]; className?: string }) {
  return (
    <div className={cn("grid grid-cols-4 gap-1", className)}>
      {Array.from({ length: 4 }, (_, i) => {
        const category = categories[i];
        return category ? (
          <ProductArt key={i} category={category} className="aspect-square" />
        ) : (
          <div key={i} className="aspect-square rounded-lg bg-muted/50" />
        );
      })}
    </div>
  );
}
