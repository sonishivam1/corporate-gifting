import { Badge } from "@gifting/ui/components/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@gifting/ui/components/card";
import { Suspense } from "react";

import { getMe } from "@/lib/api";

import { ApiStatus } from "./api-status";
import { MemberShell } from "./member-shell";

export default async function Home() {
  const result = await getMe();
  const me = result.kind === "account" ? result.me : null;

  return (
    <MemberShell title={me?.firstName ? `Welcome, ${me.firstName}` : "Welcome"}>
      {me ? (
        <section className="mb-8 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>
            You&rsquo;re signed in as <span className="font-medium text-foreground">{me.email}</span>.
          </span>
          {me.companyName ? <Badge variant="secondary">{me.companyName}</Badge> : null}
        </section>
      ) : null}
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
    </MemberShell>
  );
}
