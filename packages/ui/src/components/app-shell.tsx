import type { ReactNode } from "react";

import { Separator } from "@gifting/ui/components/separator";

/** The Gifting wordmark: a gift-box mark in the primary colour and the product name. */
function Wordmark({ app }: { app?: string }) {
  return (
    <span className="flex items-center gap-2">
      <span aria-hidden="true" className="grid size-7 place-items-center rounded-md bg-primary text-primary-foreground">
        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="8" width="18" height="4" rx="1" />
          <path d="M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7M7.5 8a2.5 2.5 0 0 1 0-5C10 3 12 8 12 8s2-5 4.5-5a2.5 2.5 0 0 1 0 5" />
        </svg>
      </span>
      <span className="font-heading text-base font-bold tracking-tight">Gifting</span>
      {app ? <span className="text-sm text-muted-foreground">· {app}</span> : null}
    </span>
  );
}

/** The page frame every app uses: the wordmark, the app name, header actions and a page title. */
function AppShell({ app, title, actions, children }: { app: string; title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="flex items-center justify-between gap-2 px-4 py-2 sm:px-8">
        <Wordmark app={app} />
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </header>
      <Separator />
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-8">
        <h1 className="mb-6 font-heading text-2xl font-bold tracking-tight">{title}</h1>
        {children}
      </main>
    </div>
  );
}

export { AppShell, Wordmark };
