"use client";

import { Alert, AlertDescription } from "@gifting/ui/components/alert";
import { Button } from "@gifting/ui/components/button";
import { CircleAlertIcon } from "lucide-react";
import { useActionState } from "react";

import { acceptInvitationAction } from "./actions";

/** Accepts as the signed-in person; the API refuses an invitation sent to another address. */
export function AcceptForm({ token, email }: { token: string; email: string }) {
  const [state, action, pending] = useActionState(acceptInvitationAction, null);
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="token" value={token} />
      {state ? (
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Joining…" : "Accept invitation"}
      </Button>
      <p className="text-center text-xs text-muted-foreground">You&apos;re signed in as {email}.</p>
    </form>
  );
}
