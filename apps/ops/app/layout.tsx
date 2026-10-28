import "@gifting/ui/globals.css";

import { ThemeProvider } from "@gifting/ui/components/theme-provider";
import { Toaster } from "@gifting/ui/components/sonner";
import { TooltipProvider } from "@gifting/ui/components/tooltip";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Ops admin · Gifting Marketplace",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <ThemeProvider>
          <TooltipProvider>{children}</TooltipProvider>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
