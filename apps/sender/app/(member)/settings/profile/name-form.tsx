"use client";

import { nameInput } from "@gifting/domain";
import { Button } from "@gifting/ui/components/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@gifting/ui/components/field";
import { Input } from "@gifting/ui/components/input";
import { toast } from "@gifting/ui/lib/toast";
import { useState, useTransition } from "react";

import { updateNameAction } from "../actions";

/** First and last name, checked with the API's own rules; the email is shown, never changed here. */
export function NameForm({ firstName, lastName, email, editable }: { firstName: string; lastName: string; email: string; editable: boolean }) {
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<{ firstName?: string; lastName?: string }>({});

  const submit = (form: FormData) => {
    const parsed = nameInput.safeParse({ firstName: form.get("firstName"), lastName: form.get("lastName") });
    if (!parsed.success) {
      const fields = parsed.error.flatten().fieldErrors;
      setErrors({ firstName: fields.firstName?.[0], lastName: fields.lastName?.[0] });
      return;
    }
    setErrors({});
    startTransition(async () => {
      const result = await updateNameAction(parsed.data);
      if (result.ok) toast.success("Your name is saved.");
      else toast.error(result.message);
    });
  };

  return (
    <form action={submit} className="grid gap-4">
      <FieldGroup className="grid gap-4 sm:grid-cols-2">
        <Field data-invalid={Boolean(errors.firstName)}>
          <FieldLabel htmlFor="firstName">First name</FieldLabel>
          <Input id="firstName" name="firstName" defaultValue={firstName} autoComplete="given-name" disabled={!editable || pending} aria-invalid={Boolean(errors.firstName)} />
          {errors.firstName ? <FieldError>{errors.firstName}</FieldError> : null}
        </Field>
        <Field data-invalid={Boolean(errors.lastName)}>
          <FieldLabel htmlFor="lastName">Last name</FieldLabel>
          <Input id="lastName" name="lastName" defaultValue={lastName} autoComplete="family-name" disabled={!editable || pending} aria-invalid={Boolean(errors.lastName)} />
          {errors.lastName ? <FieldError>{errors.lastName}</FieldError> : null}
        </Field>
      </FieldGroup>
      <Field>
        <FieldLabel htmlFor="email">Email</FieldLabel>
        <Input id="email" value={email} readOnly disabled />
      </Field>
      {editable ? (
        <div>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save name"}
          </Button>
        </div>
      ) : null}
    </form>
  );
}
