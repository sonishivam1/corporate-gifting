import type { ReactNode } from "react";

import { Separator } from "@gifting/ui/components/separator";

/** The page frame every app uses: product name, app name and a page title. */
function AppShell({ app, title, children }: { app: string; title: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="flex items-center gap-2 px-4 py-3 sm:px-8">
        <span className="text-sm font-semibold tracking-wide text-primary">Gifting Marketplace</span>
        <span className="text-sm text-muted-foreground">· {app}</span>
      </header>
      <Separator />
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-8">
        <h1 className="mb-6 text-2xl font-semibold">{title}</h1>
        {children}
      </main>
    </div>
  );
}

export { AppShell };
