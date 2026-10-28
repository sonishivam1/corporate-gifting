import { AppShell } from "@gifting/ui/components/app-shell";
import { Card, CardDescription, CardHeader, CardTitle } from "@gifting/ui/components/card";
import { Suspense } from "react";

import { ApiStatus } from "./api-status";

export default function Home() {
  return (
    <AppShell app="Ops admin" title="Run the marketplace.">
      <p className="mb-6 text-sm text-muted-foreground">
        Scaffold (M0). The milestone that builds each part is in brackets.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Companies</CardTitle>
            <CardDescription>Create companies and teams. (M1)</CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Vendors</CardTitle>
            <CardDescription>Vendors and their products, from commercetools. (M0, M2)</CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Collections</CardTitle>
            <CardDescription>Curate platform collections. (M2)</CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Money</CardTitle>
            <CardDescription>Refunds and adjustments, always with a reason. (M6)</CardDescription>
          </CardHeader>
        </Card>
      </div>
      <Suspense fallback={<p className="mt-8 text-sm text-muted-foreground">Checking the Gifting API…</p>}>
        <ApiStatus />
      </Suspense>
    </AppShell>
  );
}
