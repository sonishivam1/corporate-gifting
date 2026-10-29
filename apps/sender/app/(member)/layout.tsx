import { Button } from "@gifting/ui/components/button";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@gifting/ui/components/card";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import type { ReactNode } from "react";

import { getMe } from "@/lib/api";

/**
 * Every page in this group needs a signed-in person. `proxy.ts` has already
 * checked the session cookie; this asks the Gifting API who it belongs to.
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
  return children;
}
