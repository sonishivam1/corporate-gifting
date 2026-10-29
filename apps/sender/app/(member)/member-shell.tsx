import { AppShell } from "@gifting/ui/components/app-shell";
import { UserMenu } from "@gifting/ui/components/user-menu";
import type { ReactNode } from "react";

import { getMe } from "@/lib/api";

import { signOutAction } from "../actions";

/** The app frame for signed-in people, with their account menu. */
export async function MemberShell({ title, children }: { title: string; children: ReactNode }) {
  const result = await getMe();
  // The layout has already turned away anyone who isn't signed in.
  if (result.kind !== "account") return null;
  const { me } = result;
  const name = [me.firstName, me.lastName].filter(Boolean).join(" ") || me.email;

  return (
    <AppShell app="Sender" title={title} actions={<UserMenu name={name} email={me.email} detail={me.companyName ?? undefined} signOut={signOutAction} />}>
      {children}
    </AppShell>
  );
}
