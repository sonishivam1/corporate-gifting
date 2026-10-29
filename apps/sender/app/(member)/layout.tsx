import { Alert, AlertDescription, AlertTitle } from "@gifting/ui/components/alert";
import { Button } from "@gifting/ui/components/button";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@gifting/ui/components/card";
import { CircleAlertIcon } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import type { ReactNode } from "react";

import { Shell } from "@/components/shell";
import { ApiCallError, getBalance, getMe, getWorkspace } from "@/lib/api";

import { signOutAction } from "../actions";

/** The dashboard's workspace and balance. Only API failures are handled here; anything else (including Next's own signals) goes on up. */
async function loadWorkspace() {
  const workspace = await getWorkspace().catch((err: unknown) => {
    if (err instanceof ApiCallError) return err;
    throw err;
  });
  if (workspace instanceof ApiCallError) return { workspace: null, balance: null, problem: workspace.message };
  // The balance is the first read from the database: if that is down, say so here rather than fail every page.
  const balance = await getBalance(workspace.team.key).catch((err: unknown) => {
    if (err instanceof ApiCallError) return err;
    throw err;
  });
  if (balance instanceof ApiCallError) {
    return { workspace, balance: null, problem: balance.code === "database_unavailable" ? balance.message : null };
  }
  return { workspace, balance, problem: null };
}

/**
 * Every page in this group needs a signed-in person. `proxy.ts` has already
 * checked the session cookie; this asks the Gifting API who it belongs to,
 * then loads the dashboard's workspace (the demo company through the
 * development session, until the B2C workspace model is decided).
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
  const { workspace, balance, problem } = await loadWorkspace();
  const name = [me.firstName, me.lastName].filter(Boolean).join(" ") || me.email;
  return (
    <Shell me={workspace} balance={balance} account={{ name, email: me.email, detail: me.companyName ?? undefined }} signOut={signOutAction}>
      {problem ? (
        <Alert variant="destructive" className="mt-8">
          <CircleAlertIcon />
          <AlertTitle>Can&apos;t load the dashboard</AlertTitle>
          <AlertDescription>
            {problem} If the API is running, check that MongoDB is up (pnpm db:up), seeded (pnpm seed:demo) and that DEV_AUTH=1 is set for the development workspace.
          </AlertDescription>
        </Alert>
      ) : (
        children
      )}
    </Shell>
  );
}
