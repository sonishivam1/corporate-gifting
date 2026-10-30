"use client";

import { OCCASION_LABELS, type ProductView } from "@gifting/domain";
import { Badge } from "@gifting/ui/components/badge";
import { Button } from "@gifting/ui/components/button";
import { Card, CardContent, CardFooter } from "@gifting/ui/components/card";
import { Field, FieldLabel } from "@gifting/ui/components/field";
import { NativeSelect, NativeSelectOption } from "@gifting/ui/components/native-select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@gifting/ui/components/sheet";
import { SendIcon } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";

import { ProductArt } from "@/components/product-art";
import { money, priceLabel } from "@/lib/format";

const sendHref = (sku: string) => `/campaigns/new?sku=${encodeURIComponent(sku)}`;

export function ProductCard({ product }: { product: ProductView }) {
  const [sku, setSku] = useState(product.sku);
  const variant = product.variants.find((v) => v.sku === sku) ?? product.variants[0]!;
  const variantId = useId();
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <Sheet>
        <SheetTrigger asChild>
          <button type="button" className="text-left" aria-label={`Details for ${product.name}`}>
            <ProductArt category={product.category} imageUrl={product.imageUrl} className="aspect-[4/3] rounded-none" />
          </button>
        </SheetTrigger>
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{product.brand}</p>
            <SheetTitle>{product.name}</SheetTitle>
            <SheetDescription>{product.description}</SheetDescription>
          </SheetHeader>
          <div className="grid gap-4 px-4">
            <ProductArt
              category={product.category}
              imageUrl={variant.imageUrl ?? product.imageUrl}
              sizes="(min-width: 640px) 24rem, 100vw"
              className="aspect-[4/3]"
            />
            {product.variants.length > 1 ? (
              <Field>
                <FieldLabel htmlFor={variantId}>Option</FieldLabel>
                <NativeSelect id={variantId} value={sku} onChange={(e) => setSku(e.target.value)}>
                  {product.variants.map((v) => (
                    <NativeSelectOption key={v.sku} value={v.sku}>
                      {v.label} · {money(v.priceCents)}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
            ) : null}
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <dt className="text-muted-foreground">Price</dt>
              <dd className="font-semibold tabular-nums">{money(variant.priceCents)}</dd>
              <dt className="text-muted-foreground">Ships from</dt>
              <dd>{product.vendorName}</dd>
              <dt className="text-muted-foreground">Ships in</dt>
              <dd>{product.slaDays} days</dd>
            </dl>
            <div className="flex flex-wrap gap-1.5">
              {product.occasions.map((o) => (
                <Badge key={o} variant="outline">
                  {OCCASION_LABELS[o]}
                </Badge>
              ))}
            </div>
          </div>
          <SheetFooter>
            <Button asChild>
              <Link href={sendHref(variant.sku)}>
                <SendIcon /> Send this gift
              </Link>
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
      <CardContent className="grid gap-1 px-4 pt-3">
        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{product.brand}</span>
        <span className="font-medium">{product.name}</span>
        <span className="text-xs text-muted-foreground">
          Ships in {product.slaDays} days · {product.vendorName}
          {product.variants.length > 1 ? ` · ${product.variants.length} options` : null}
        </span>
      </CardContent>
      <CardFooter className="mt-auto flex items-center justify-between px-4 pt-3 pb-4">
        <span className="font-semibold tabular-nums">{priceLabel(product)}</span>
        <Button asChild size="sm" variant="outline">
          <Link href={sendHref(product.sku)}>
            <SendIcon /> Send
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
