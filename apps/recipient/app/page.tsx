import { AppShell } from "@gifting/ui/components/app-shell";
import { Card, CardDescription, CardHeader, CardTitle } from "@gifting/ui/components/card";
import { Suspense } from "react";

import { ApiStatus } from "./api-status";

export default function Home() {
  return (
    <AppShell app="Recipient experience" title="You've got a gift.">
      <p className="mb-6 text-sm text-muted-foreground">
        Scaffold (M0). The milestone that builds each part is in brackets.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Unwrap</CardTitle>
            <CardDescription>Open the gift and read the greeting. (M4)</CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Choose</CardTitle>
            <CardDescription>Pick something you like from the collection; no prices shown. (M4)</CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Ship</CardTitle>
            <CardDescription>Enter your address; it goes to the shipper, not the sender. (M4)</CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Track</CardTitle>
            <CardDescription>Follow your order to your door. (M4)</CardDescription>
          </CardHeader>
        </Card>
      </div>
      <Suspense fallback={<p className="mt-8 text-sm text-muted-foreground">Checking the Gifting API…</p>}>
        <ApiStatus />
      </Suspense>
    </AppShell>
  );
}
