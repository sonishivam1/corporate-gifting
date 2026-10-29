import "@gifting/ui/globals.css";

import { Alert, AlertDescription, AlertTitle } from "@gifting/ui/components/alert";
import { ThemeProvider } from "@gifting/ui/components/theme-provider";
import { Toaster } from "@gifting/ui/components/sonner";
import { TooltipProvider } from "@gifting/ui/components/tooltip";
import { CircleAlertIcon } from "lucide-react";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import { Shell } from "@/components/shell";
import { ApiCallError, getBalance, getMe } from "@/lib/api";

export const metadata: Metadata = {
  title: "Sender dashboard · Gifting Marketplace",
};

async function loadSession() {
  // Only API failures are handled here; anything else (including Next's own signals) goes on up.
  const me = await getMe().catch((err: unknown) => {
    if (err instanceof ApiCallError) return err;
    throw err;
  });
  if (me instanceof ApiCallError) return { me: null, balance: null, problem: me.message };
  const balance = await getBalance(me.team.key).catch((err: unknown) => {
    if (err instanceof ApiCallError) return null;
    throw err;
  });
  return { me, balance, problem: null };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const { me, balance, problem } = await loadSession();
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <ThemeProvider>
          <TooltipProvider>
            <Shell me={me} balance={balance}>
              {problem ? (
                <Alert variant="destructive" className="mt-8">
                  <CircleAlertIcon />
                  <AlertTitle>Can&apos;t load the dashboard</AlertTitle>
                  <AlertDescription>
                    {problem} If the API is running, check that MongoDB is up (pnpm db:up) and seeded (pnpm seed:demo).
                  </AlertDescription>
                </Alert>
              ) : (
                children
              )}
            </Shell>
          </TooltipProvider>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
