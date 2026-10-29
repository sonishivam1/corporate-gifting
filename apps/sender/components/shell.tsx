"use client";

import type { BalanceView, MeView } from "@gifting/domain";
import { Button } from "@gifting/ui/components/button";
import { Field, FieldLabel } from "@gifting/ui/components/field";
import { NativeSelect, NativeSelectOption } from "@gifting/ui/components/native-select";
import { SidebarShell, type SidebarNavItem } from "@gifting/ui/components/sidebar-shell";
import { Tooltip, TooltipContent, TooltipTrigger } from "@gifting/ui/components/tooltip";
import { UserMenu } from "@gifting/ui/components/user-menu";
import { ChartColumnIcon, GridIcon, HouseIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useTransition } from "react";

import { switchTeam, switchUser } from "@/app/session-actions";
import { money } from "@/lib/format";

const NAV: SidebarNavItem[] = [
  { href: "/", label: "Home", icon: HouseIcon, exact: true },
  { href: "/browse", label: "Browse gifts", icon: GridIcon },
  { href: "/campaigns", label: "Campaigns", icon: ChartColumnIcon },
];

/**
 * The dashboard frame: navigation, the workspace footer (team, balance,
 * "Viewing as") and the signed-in person's account menu with sign-out.
 */
export function Shell({
  me,
  balance,
  account,
  signOut,
  children,
}: {
  me: MeView | null;
  balance: BalanceView | null;
  account: { name: string; email: string; detail?: string };
  signOut: () => Promise<void>;
  children: ReactNode;
}) {
  const pathname = usePathname();
  return (
    <SidebarShell
      app="Sender dashboard"
      nav={NAV}
      currentPath={pathname}
      linkAs={Link}
      footer={me ? <Footer me={me} balance={balance} /> : null}
      actions={<UserMenu name={account.name} email={account.email} detail={account.detail} signOut={signOut} />}
    >
      {children}
    </SidebarShell>
  );
}

function Footer({ me, balance }: { me: MeView; balance: BalanceView | null }) {
  const [pending, startTransition] = useTransition();
  return (
    <div className="grid gap-3 p-2" aria-busy={pending}>
      {me.teams.length > 1 ? (
        <Field>
          <FieldLabel htmlFor="team">Team</FieldLabel>
          <NativeSelect
            id="team"
            value={me.team.key}
            disabled={pending}
            onChange={(e) => startTransition(() => switchTeam(e.target.value))}
          >
            {me.teams.map((t) => (
              <NativeSelectOption key={t.key} value={t.key}>
                {t.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
      ) : null}
      <div>
        <p className="text-xs text-muted-foreground">Available to send</p>
        <p className="text-xl font-semibold tabular-nums">{balance ? money(balance.availableCents) : "–"}</p>
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0}>
            <Button variant="outline" size="sm" className="w-full" disabled>
              <PlusIcon /> Top up
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>Card and invoice top-ups arrive in M1.</TooltipContent>
      </Tooltip>
      {me.devUsers ? (
        <Field>
          <FieldLabel htmlFor="viewing-as">Viewing as (development)</FieldLabel>
          <NativeSelect
            id="viewing-as"
            value={me.user.id}
            disabled={pending}
            onChange={(e) => startTransition(() => switchUser(e.target.value))}
          >
            {me.devUsers.map((u) => (
              <NativeSelectOption key={u.id} value={u.id}>
                {u.name} ({u.role})
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
      ) : null}
    </div>
  );
}
