import { Gift } from "lucide-react";
import type { ReactNode } from "react";

/** One calm column that works on a phone first. */
export function Frame({ children, privacy }: { children: ReactNode; privacy: string }) {
  return (
    <main className="grid min-h-screen justify-items-center bg-muted/40 px-4 py-6 sm:content-center">
      <div className="w-full max-w-md">
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">{children}</div>
        <p className="mt-4 px-1 text-center text-xs text-muted-foreground">{privacy}</p>
      </div>
    </main>
  );
}

/** A message in place of the flow: the link cannot be used, or something is wrong. */
export function Notice({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="grid gap-3 px-6 py-12 text-center">
      <div className="mx-auto grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">
        <Gift className="size-5" />
      </div>
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="text-sm text-muted-foreground">{hint}</p>
    </div>
  );
}
