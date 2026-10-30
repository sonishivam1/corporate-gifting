import type { ProductCategory } from "@gifting/domain";
import { cn } from "@gifting/ui/lib/utils";
import Image from "next/image";

import { CATEGORY } from "@/lib/catalog";
import { isOptimizable } from "@/lib/images";

/**
 * The product's photo, or a category icon when it has none (the fictional
 * seed products have no photos). Decorative: the name sits next to it.
 */
export function ProductArt({
  category,
  imageUrl,
  sizes = "(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw",
  className,
}: {
  category: ProductCategory;
  imageUrl?: string | null;
  sizes?: string;
  className?: string;
}) {
  if (imageUrl) {
    return (
      <div className={cn("relative overflow-hidden rounded-lg bg-muted", className)} aria-hidden>
        <Image src={imageUrl} alt="" fill sizes={sizes} unoptimized={!isOptimizable(imageUrl)} className="object-cover" />
      </div>
    );
  }
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
