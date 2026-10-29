"use client";

import { Alert, AlertDescription } from "@gifting/ui/components/alert";
import { Button } from "@gifting/ui/components/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@gifting/ui/components/field";
import { Input } from "@gifting/ui/components/input";
import { PasswordInput } from "@gifting/ui/components/password-input";
import { useActionState } from "react";

import { type FormState, resendVerificationAction, signInAction } from "../../actions";

export function SignInForm({ returnTo, notice }: { returnTo: string; notice?: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(signInAction, {});
  const [resent, resend, resending] = useActionState<FormState, FormData>(resendVerificationAction, {});
  const errors = state.fieldErrors ?? {};

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
      {state.unverified ? (
        <form action={resend} className="flex flex-col gap-2">
          <input type="hidden" name="email" value={state.values?.email ?? ""} />
          <Button type="submit" variant="outline" disabled={resending || resent.sent}>
            {resent.sent ? "New link sent. Check your inbox." : resending ? "Sending…" : "Send me a new verification link"}
          </Button>
          {resent.error ? <p className="text-sm text-destructive">{resent.error}</p> : null}
        </form>
      ) : null}
      <form action={action} noValidate>
        <input type="hidden" name="returnTo" value={returnTo} />
        <FieldGroup>
          <Field data-invalid={Boolean(errors.email)}>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input id="email" name="email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} autoFocus required maxLength={254} defaultValue={state.values?.email} aria-invalid={Boolean(errors.email)} />
            <FieldError>{errors.email}</FieldError>
          </Field>
          <Field data-invalid={Boolean(errors.password)}>
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <PasswordInput id="password" name="password" autoComplete="current-password" required aria-invalid={Boolean(errors.password)} />
            <FieldError>{errors.password}</FieldError>
          </Field>
          <Button type="submit" size="lg" disabled={pending}>
            {pending ? "Signing in…" : "Sign in"}
          </Button>
        </FieldGroup>
      </form>
    </div>
  );
}
