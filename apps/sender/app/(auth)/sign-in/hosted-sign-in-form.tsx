"use client";

import { Alert, AlertDescription } from "@gifting/ui/components/alert";
import { Button } from "@gifting/ui/components/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@gifting/ui/components/field";
import { Input } from "@gifting/ui/components/input";
import { useActionState, useEffect } from "react";

import { type FormState, hostedSignInAction } from "../../actions";

/** Sign-in on a platform with its own sign-in page: ask for the email, then hand over to that page. */
export function HostedSignInForm({ returnTo, notice }: { returnTo: string; notice?: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(hostedSignInAction, {});
  const errors = state.fieldErrors ?? {};
  const leaving = Boolean(state.goTo);

  useEffect(() => {
    if (state.goTo) window.location.assign(state.goTo);
  }, [state.goTo]);

  return (
    <div className="flex flex-col gap-4">
      {notice && !state.error ? (
        <Alert>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      ) : null}
      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <form action={action} noValidate>
        <input type="hidden" name="returnTo" value={returnTo} />
        <FieldGroup>
          <Field data-invalid={Boolean(errors.email)}>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input id="email" name="email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} autoFocus required maxLength={254} defaultValue={state.values?.email} aria-invalid={Boolean(errors.email)} />
            {errors.email ? <FieldError>{errors.email}</FieldError> : <FieldDescription>We&apos;ll take you to a secure page to confirm it. New here? Your account is created there.</FieldDescription>}
          </Field>
          <Button type="submit" size="lg" disabled={pending || leaving}>
            {pending || leaving ? "Taking you there…" : "Continue"}
          </Button>
        </FieldGroup>
      </form>
    </div>
  );
}
