import { AppShell } from "@gifting/ui/components/app-shell";
import { Card, CardDescription, CardHeader, CardTitle } from "@gifting/ui/components/card";
import { Suspense } from "react";

import { ApiStatus } from "./api-status";

export default function Home() {
  return (
    <AppShell app="Sender dashboard" title="Send gifts your team will actually want.">
      <p className="mb-6 text-sm text-muted-foreground">
        Scaffold (M0). The milestone that builds each part is in brackets.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Teams and budgets</CardTitle>
            <CardDescription>Fund a team, see what is held and what is spent. (M1)</CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Collections</CardTitle>
            <CardDescription>Pick anything up to a budget, across brands. (M2)</CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Campaigns</CardTitle>
            <CardDescription>One-time, scheduled and automated sends with approvals. (M3, M5)</CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Tracking</CardTitle>
            <CardDescription>Sent, opened, redeemed, shipped and delivered. (M6)</CardDescription>
          </CardHeader>
        </Card>
      </div>
      <Suspense fallback={<p className="mt-8 text-sm text-muted-foreground">Checking the Gifting API…</p>}>
        <ApiStatus />
      </Suspense>
    </AppShell>
  );
}
