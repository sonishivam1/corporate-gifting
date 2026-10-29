"use client";

import { toCanvas } from "qrcode";
import { useEffect, useRef } from "react";

import { cn } from "@gifting/ui/lib/utils";

/**
 * A scannable QR code for a gift link, drawn in the browser. Colours come
 * from the theme so it reads in light and dark mode.
 */
function QrCode({ value, size = 160, label, className }: { value: string; size?: number; label: string; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const styles = getComputedStyle(canvas);
    void toCanvas(canvas, value, {
      width: size,
      margin: 2,
      errorCorrectionLevel: "M",
      color: { dark: styles.color || "#000000", light: "#00000000" },
    });
  }, [value, size]);

  return (
    <canvas
      ref={ref}
      role="img"
      aria-label={label}
      width={size}
      height={size}
      className={cn("rounded-md bg-background text-foreground", className)}
    />
  );
}

export { QrCode };
