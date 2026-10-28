import { AppShell } from "@gifting/ui/components/app-shell";
import { Card, CardDescription, CardHeader, CardTitle } from "@gifting/ui/components/card";
import { Suspense } from "react";

import { ApiStatus } from "./api-status";

export default function Home() {
  return (
    <AppShell app="Vendor portal" title="Orders to fulfil.">
      <p className="mb-6 text-sm text-muted-foreground">
        Scaffold (M0). The milestone that builds each part is in brackets.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Orders</CardTitle>
            <CardDescription>Gift orders routed to your brand only. (M4)</CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Ship</CardTitle>
            <CardDescription>Mark shipped with carrier and tracking number. (M4)</CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Export</CardTitle>
            <CardDescription>Download your orders as CSV. (M4)</CardDescription>
          </CardHeader>
        </Card>
      </div>
      <Suspense fallback={<p className="mt-8 text-sm text-muted-foreground">Checking the Gifting API…</p>}>
        <ApiStatus />
      </Suspense>
    </AppShell>
  );
}
