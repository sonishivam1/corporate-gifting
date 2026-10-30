"use client";

import { passwordChecks } from "@gifting/domain";
import { Alert, AlertDescription } from "@gifting/ui/components/alert";
import { Button } from "@gifting/ui/components/button";
import { Checkbox } from "@gifting/ui/components/checkbox";
import { Checklist } from "@gifting/ui/components/checklist";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@gifting/ui/components/field";
import { Input } from "@gifting/ui/components/input";
import { PasswordInput } from "@gifting/ui/components/password-input";
import Link from "next/link";
import { useActionState, useState } from "react";

import { type FormState, registerAction } from "../../actions";

export function RegisterForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(registerAction, {});
  const errors = state.fieldErrors ?? {};
  const v = state.values ?? {};

  // The password fields drive the live checklist and the "don't match" hint.
  // React empties the form after each submit, so they start again too.
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  // Each answer from the server is a new "round": the terms box is remounted
  // so it shows what was submitted (it reads its default only when mounted).
  const [shownState, setShownState] = useState(state);
  const [round, setRound] = useState(0);
  if (shownState !== state) {
    setShownState(state);
    setRound((r) => r + 1);
    setPassword("");
    setConfirm("");
  }
  const mismatch = confirm.length > 0 && confirm !== password;

  return (
    <form action={action} noValidate className="flex flex-col gap-4">
      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <FieldGroup>
        <div className="grid grid-cols-2 gap-3">
          <Field data-invalid={Boolean(errors.firstName)}>
            <FieldLabel htmlFor="firstName">First name</FieldLabel>
            <Input id="firstName" name="firstName" autoComplete="given-name" autoFocus required maxLength={100} defaultValue={v.firstName} aria-invalid={Boolean(errors.firstName)} />
            <FieldError>{errors.firstName}</FieldError>
          </Field>
          <Field data-invalid={Boolean(errors.lastName)}>
            <FieldLabel htmlFor="lastName">Last name</FieldLabel>
            <Input id="lastName" name="lastName" autoComplete="family-name" required maxLength={100} defaultValue={v.lastName} aria-invalid={Boolean(errors.lastName)} />
            <FieldError>{errors.lastName}</FieldError>
          </Field>
        </div>
        <Field data-invalid={Boolean(errors.email)}>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input id="email" name="email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} required maxLength={254} defaultValue={v.email} aria-invalid={Boolean(errors.email)} />
          <FieldError>
            {errors.email}
            {state.emailTaken ? (
              <>
                {" "}
                <Link href="/sign-in" className="font-medium underline underline-offset-4">
                  Go to sign in
                </Link>
              </>
            ) : null}
          </FieldError>
        </Field>
        <Field data-invalid={Boolean(errors.password)}>
          <FieldLabel htmlFor="password">Password</FieldLabel>
          <PasswordInput
            id="password"
            name="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={Boolean(errors.password)}
            aria-describedby="password-rules"
          />
          <Checklist id="password-rules" items={passwordChecks(password)} />
          <FieldError>{errors.password}</FieldError>
        </Field>
        <Field data-invalid={Boolean(errors.confirmPassword) || mismatch}>
          <FieldLabel htmlFor="confirmPassword">Confirm password</FieldLabel>
          <PasswordInput
            id="confirmPassword"
            name="confirmPassword"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            aria-invalid={Boolean(errors.confirmPassword) || mismatch}
          />
          <FieldError>{mismatch ? "The passwords don't match." : errors.confirmPassword}</FieldError>
        </Field>
        <Field data-invalid={Boolean(errors.companyName)}>
          <FieldLabel htmlFor="companyName">
            Company <span className="font-normal text-muted-foreground">(optional)</span>
          </FieldLabel>
          <Input id="companyName" name="companyName" autoComplete="organization" maxLength={100} defaultValue={v.companyName} aria-invalid={Boolean(errors.companyName)} />
          {errors.companyName ? <FieldError>{errors.companyName}</FieldError> : <FieldDescription>Shown on the gifts you send.</FieldDescription>}
        </Field>
        <Field orientation="horizontal" data-invalid={Boolean(errors.acceptTerms)}>
          <Checkbox key={round} id="acceptTerms" name="acceptTerms" value="on" defaultChecked={v.acceptTerms === "on"} aria-invalid={Boolean(errors.acceptTerms)} />
          <FieldLabel htmlFor="acceptTerms" className="font-normal">
            I accept the terms of service and privacy policy
          </FieldLabel>
        </Field>
        <FieldError>{errors.acceptTerms}</FieldError>
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Creating your account…" : "Create account"}
        </Button>
      </FieldGroup>
    </form>
  );
}
