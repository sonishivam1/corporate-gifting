import "@gifting/ui/globals.css";

import { Toaster } from "@gifting/ui/components/sonner";
import { ThemeProvider } from "@gifting/ui/components/theme-provider";
import { TooltipProvider } from "@gifting/ui/components/tooltip";
import { fontVariables } from "@gifting/ui/lib/fonts";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Sender dashboard · Gifting Marketplace",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // The font variables go on <html>, where --font-sans is resolved (globals.css).
    <html lang="en" className={fontVariables} suppressHydrationWarning>
      <body className="font-sans antialiased">
        <ThemeProvider>
          <TooltipProvider>{children}</TooltipProvider>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
