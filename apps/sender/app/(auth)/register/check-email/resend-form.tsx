"use client";

import { Button } from "@gifting/ui/components/button";
import { Field, FieldLabel } from "@gifting/ui/components/field";
import { Input } from "@gifting/ui/components/input";
import { useActionState } from "react";

import { type FormState, resendVerificationAction } from "../../../actions";

/** "Send a new link". Asks for the address only when this browser doesn't know it. */
export function ResendForm({ askForEmail }: { askForEmail: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(resendVerificationAction, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      {askForEmail ? (
        <Field>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </Field>
      ) : null}
      <Button type="submit" variant="outline" disabled={pending || state.sent}>
        {state.sent ? "New link sent. Check your inbox." : pending ? "Sending…" : "Send a new link"}
      </Button>
      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
    </form>
  );
}
