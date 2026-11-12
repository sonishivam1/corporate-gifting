import { Alert, AlertDescription, AlertTitle } from "@gifting/ui/components/alert";
import { Button } from "@gifting/ui/components/button";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@gifting/ui/components/card";
import { CircleAlertIcon } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import type { ReactNode } from "react";

import { Shell } from "@/components/shell";
import { ApiCallError, getBalance, getCampaigns, getMe, getWorkspace } from "@/lib/api";

import { signOutAction } from "../actions";

/** The API's answer when the remembered company or team is no longer the person's. */
const STALE_CHOICE = new Set(["company_not_found", "team_not_found"]);

/** The dashboard's workspace and balance. Only API failures are handled here; anything else (including Next's own signals) goes on up. */
async function loadWorkspace() {
  const workspace = await getWorkspace().catch((err: unknown) => {
    if (err instanceof ApiCallError) return err;
    throw err;
  });
  if (workspace instanceof ApiCallError) {
    if (STALE_CHOICE.has(workspace.code)) return { workspace: null, balance: null, pendingApprovals: 0, problem: null, noMembership: false, staleChoice: true };
    return { workspace: null, balance: null, pendingApprovals: 0, problem: workspace.message, noMembership: workspace.code === "no_membership", staleChoice: false };
  }
  // The balance is the first read from the database: if that is down, say so here rather than fail every page.
  const balance = await getBalance(workspace.team.key).catch((err: unknown) => {
    if (err instanceof ApiCallError) return err;
    throw err;
  });
  if (balance instanceof ApiCallError) {
    return { workspace, balance: null, pendingApprovals: 0, problem: balance.code === "database_unavailable" ? balance.message : null, noMembership: false, staleChoice: false };
  }
  // For the bell: a failure here only hides the count.
  const pendingApprovals = await getCampaigns("pending_approval", 1)
    .then((list) => list.counts.pending_approval)
    .catch((err: unknown) => {
      if (err instanceof ApiCallError) return 0;
      throw err;
    });
  return { workspace, balance, pendingApprovals, problem: null, noMembership: false, staleChoice: false };
}

/**
 * Every page in this group needs a signed-in person. `proxy.ts` has already
 * checked the session cookie; this asks the Gifting API who it belongs to,
 * then loads the dashboard's workspace: the company and team they work in,
 * from their memberships (ADR 0016). Someone in no company yet gets a page
 * that says how to join; a remembered company or team that is no longer
 * theirs is forgotten (/workspace/reset).
 */
export default async function SignedInLayout({ children }: { children: ReactNode }) {
  await connection();
  const result = await getMe();
  if (result.kind === "signed-out") redirect("/sign-in");
  if (result.kind === "unavailable") {
    return (
      <main className="grid min-h-screen place-items-center bg-muted p-4">
        <Card className="w-full max-w-sm text-center">
          <CardHeader>
            <CardTitle>Gifting is unavailable</CardTitle>
            <CardDescription>We can&rsquo;t reach the Gifting service right now. Try again in a minute.</CardDescription>
          </CardHeader>
          <CardFooter className="justify-center">
            <Button asChild variant="outline">
              <Link href="/">Try again</Link>
            </Button>
          </CardFooter>
        </Card>
      </main>
    );
  }

  const { me } = result;
  const { workspace, balance, pendingApprovals, problem, noMembership, staleChoice } = await loadWorkspace();
  // Outside any try: redirect() works by throwing.
  if (staleChoice) redirect("/workspace/reset");
  const name = [me.firstName, me.lastName].filter(Boolean).join(" ") || me.email;
  if (noMembership) {
    return (
      <main className="grid min-h-screen place-items-center bg-muted p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>You&rsquo;re not in a company yet</CardTitle>
            <CardDescription>
              You&rsquo;re signed in as {me.email}, but no company has added you. Ask your company&rsquo;s owner or admin to add you, then sign in again.
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <form action={signOutAction}>
              <Button type="submit" variant="outline">
                Sign out
              </Button>
            </form>
          </CardFooter>
        </Card>
      </main>
    );
  }
  return (
    <Shell me={workspace} balance={balance} pendingApprovals={pendingApprovals} account={{ name, email: me.email, detail: me.companyName ?? undefined }} signOut={signOutAction}>
      {problem ? (
        <Alert variant="destructive" className="mt-8">
          <CircleAlertIcon />
          <AlertTitle>Can&apos;t load the dashboard</AlertTitle>
          <AlertDescription>
            {problem} If the API is running, check that MongoDB is up (pnpm db:up) and seeded (pnpm seed:demo). In development, DEV_AUTH=1 runs the dashboard as the demo company.
          </AlertDescription>
        </Alert>
      ) : (
        children
      )}
    </Shell>
  );
}
