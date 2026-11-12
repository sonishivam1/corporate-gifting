import { Alert, AlertDescription, AlertTitle } from "@gifting/ui/components/alert";
import { Button } from "@gifting/ui/components/button";
import { LockIcon } from "lucide-react";
import Link from "next/link";

/**
 * Shown instead of a page the person's role doesn't allow on this team
 * (ADR 0016). The API refuses the action anyway; this says why, plainly.
 */
export function NotAllowed({ what }: { what: string }) {
  return (
    <div className="grid max-w-xl gap-4 pt-8">
      <Alert>
        <LockIcon />
        <AlertTitle>Your role can&apos;t {what} on this team</AlertTitle>
        <AlertDescription>Ask your company&apos;s owner or admin if you need to. You can still see the team&apos;s campaigns and gifts.</AlertDescription>
      </Alert>
      <div>
        <Button asChild variant="outline">
          <Link href="/">Back to Home</Link>
        </Button>
      </div>
    </div>
  );
}
