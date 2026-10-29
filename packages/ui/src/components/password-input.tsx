"use client";

import { Eye, EyeOff } from "lucide-react";
import { type ComponentProps, type KeyboardEvent, useState } from "react";

import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@gifting/ui/components/input-group";

/**
 * A password field with a show/hide button and a Caps Lock warning. Showing
 * the password is per field and resets on each visit; the button says what
 * it will do ("Show password" / "Hide password") for screen readers.
 */
function PasswordInput({ id, className, onKeyUp, onKeyDown, ...props }: Omit<ComponentProps<"input">, "type">) {
  const [visible, setVisible] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const watchCapsLock = (event: KeyboardEvent<HTMLInputElement>) => setCapsLock(event.getModifierState?.("CapsLock") ?? false);
  const warningId = id ? `${id}-caps-lock` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <InputGroup className={className}>
        <InputGroupInput
          id={id}
          type={visible ? "text" : "password"}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-describedby={capsLock ? warningId : undefined}
          onKeyUp={(e) => {
            watchCapsLock(e);
            onKeyUp?.(e);
          }}
          onKeyDown={(e) => {
            watchCapsLock(e);
            onKeyDown?.(e);
          }}
          onBlur={() => setCapsLock(false)}
          {...props}
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton size="icon-xs" aria-label={visible ? "Hide password" : "Show password"} aria-pressed={visible} onClick={() => setVisible((v) => !v)}>
            {visible ? <EyeOff /> : <Eye />}
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      {capsLock ? (
        <p id={warningId} role="status" className="text-xs text-muted-foreground">
          Caps Lock is on.
        </p>
      ) : null}
    </div>
  );
}

export { PasswordInput };
