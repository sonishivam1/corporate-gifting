"use client";

import { Button } from "@gifting/ui/components/button";
import { Input } from "@gifting/ui/components/input";
import { Label } from "@gifting/ui/components/label";
import { NativeSelect } from "@gifting/ui/components/native-select";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { claimGift, type ShipInput } from "../actions";

const STATES = "AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC".split(" ");

type Copy = {
  yourGift: string;
  title: string;
  name: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  stateChoose: string;
  zip: string;
  usOnly: string;
  submit: string;
  submitting: string;
  errorField: string;
  errorZip: string;
  errorState: string;
  tryAgain: string;
  used: string;
  unavailable: string;
};

const EMPTY: ShipInput = { name: "", line1: "", line2: "", city: "", region: "", postalCode: "" };

/** The shipping address, and the one button that claims the gift. The server checks everything again. */
export function ShipForm({ token, sku, itemName, copy }: { token: string; sku: string; itemName: string; copy: Copy }) {
  const router = useRouter();
  const [form, setForm] = useState<ShipInput>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof ShipInput, string>>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const set = <K extends keyof ShipInput>(key: K, value: ShipInput[K]) => setForm((f) => ({ ...f, [key]: value }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setProblem(null);
    start(async () => {
      const result = await claimGift(token, sku, form);
      if (result.ok) {
        router.replace(`/r/${token}/done`);
        return;
      }
      if (result.code === "invalid_address") {
        const next: Partial<Record<keyof ShipInput, string>> = {};
        for (const f of result.fields ?? []) next[f as keyof ShipInput] = f === "postalCode" ? copy.errorZip : f === "region" ? copy.errorState : copy.errorField;
        setErrors(next);
        return;
      }
      setErrors({});
      if (result.code === "item_unavailable") router.replace(`/r/${token}/gifts/${encodeURIComponent(sku)}`);
      else setProblem(result.code === "gift_used" ? copy.used : result.code === "unreachable" ? copy.unavailable : copy.tryAgain);
    });
  }

  const field = (key: keyof ShipInput, label: string, props: React.ComponentProps<typeof Input> = {}) => (
    <div className="grid gap-1.5">
      <Label htmlFor={key}>{label}</Label>
      <Input id={key} value={form[key]} onChange={(e) => set(key, e.target.value)} aria-invalid={Boolean(errors[key])} {...props} />
      {errors[key] && (
        <p className="text-xs text-destructive" role="alert">
          {errors[key]}
        </p>
      )}
    </div>
  );

  return (
    <form onSubmit={submit} noValidate className="grid gap-4 p-5">
      <div className="rounded-lg bg-muted p-3">
        <p className="text-xs text-muted-foreground">{copy.yourGift}</p>
        <p className="text-sm font-medium">{itemName}</p>
      </div>
      <h1 className="text-lg font-semibold">{copy.title}</h1>
      {field("name", copy.name, { autoComplete: "name" })}
      {field("line1", copy.line1, { autoComplete: "address-line1" })}
      {field("line2", copy.line2, { autoComplete: "address-line2" })}
      {field("city", copy.city, { autoComplete: "address-level2" })}
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="region">{copy.state}</Label>
          <NativeSelect className="w-full" id="region" autoComplete="address-level1" value={form.region} onChange={(e) => set("region", e.target.value)} aria-invalid={Boolean(errors.region)}>
            <option value="">{copy.stateChoose}</option>
            {STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </NativeSelect>
          {errors.region && (
            <p className="text-xs text-destructive" role="alert">
              {errors.region}
            </p>
          )}
        </div>
        {field("postalCode", copy.zip, { inputMode: "numeric", autoComplete: "postal-code" })}
      </div>
      <p className="text-xs text-muted-foreground">{copy.usOnly}</p>
      {problem && (
        <p className="rounded-lg bg-destructive/5 p-3 text-sm text-destructive" role="alert">
          {problem}
        </p>
      )}
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? copy.submitting : copy.submit}
      </Button>
    </form>
  );
}
