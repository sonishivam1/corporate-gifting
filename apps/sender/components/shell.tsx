"use client";

import type { BalanceView, MeView } from "@gifting/domain";
import { Badge } from "@gifting/ui/components/badge";
import { Button } from "@gifting/ui/components/button";
import { Field, FieldLabel } from "@gifting/ui/components/field";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@gifting/ui/components/input-group";
import { NativeSelect, NativeSelectOption } from "@gifting/ui/components/native-select";
import { SidebarShell, type SidebarNavItem } from "@gifting/ui/components/sidebar-shell";
import { Tooltip, TooltipContent, TooltipTrigger } from "@gifting/ui/components/tooltip";
import { UserMenu } from "@gifting/ui/components/user-menu";
import { BellIcon, Building2Icon, ChartColumnIcon, GridIcon, HouseIcon, LayersIcon, PlusIcon, RepeatIcon, SearchIcon, WalletIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useTransition } from "react";

import { switchTeam, switchUser } from "@/app/session-actions";
import { money } from "@/lib/format";

/** The prototype's menu, in its order. Pages not built yet show "Soon". */
const NAV: SidebarNavItem[] = [
  { href: "/", label: "Home", icon: HouseIcon, exact: true },
  { href: "/browse", label: "Browse gifts", icon: GridIcon },
  { href: "/collections", label: "Collections", icon: LayersIcon },
  { href: "/campaigns", label: "Campaigns", icon: ChartColumnIcon },
  { href: "/automations", label: "Automations", icon: RepeatIcon, soon: true },
  { href: "/budgets", label: "Budgets", icon: WalletIcon, soon: true },
];

/** Search campaigns by name: a plain GET form, so it works before scripts load. */
function Search() {
  return (
    <form action="/campaigns" role="search" className="w-full max-w-md">
      <InputGroup>
        <InputGroupAddon>
          <SearchIcon />
        </InputGroupAddon>
        <InputGroupInput type="search" name="q" placeholder="Search campaigns…" aria-label="Search campaigns" />
      </InputGroup>
    </form>
  );
}

/** The signed-in person's company, at the left of the top bar (as in the overview mockup). */
function CompanyContext({ name }: { name: string }) {
  return (
    <span className="flex min-w-0 items-center gap-2 rounded-lg border bg-background px-3 py-1.5 text-sm font-medium">
      <Building2Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="truncate">{name}</span>
    </span>
  );
}

/** Sends waiting for approval; opens Campaigns on that tab. */
function ApprovalsBell({ count }: { count: number }) {
  const label = count ? `${count} ${count === 1 ? "send" : "sends"} waiting for approval` : "No sends waiting for approval";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button asChild variant="ghost" size="icon" className="relative">
          <Link href="/campaigns?status=pending_approval" aria-label={label}>
            <BellIcon />
            {count ? (
              <Badge className="absolute -top-0.5 -right-0.5 h-4 min-w-4 rounded-full px-1 text-[0.625rem] tabular-nums">{count}</Badge>
            ) : null}
          </Link>
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/**
 * The dashboard frame: navigation, the workspace footer (team, balance,
 * "Viewing as") and the signed-in person's account menu with sign-out.
 */
export function Shell({
  me,
  balance,
  pendingApprovals,
  account,
  signOut,
  children,
}: {
  me: MeView | null;
  balance: BalanceView | null;
  pendingApprovals: number;
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
      // The signed-in person's own company, from their account (read live from the commerce platform on every page).
      context={account.detail ? <CompanyContext name={account.detail} /> : undefined}
      topBar={<Search />}
      actions={
        <>
          <ApprovalsBell count={pendingApprovals} />
          <UserMenu name={account.name} email={account.email} detail={account.detail} signOut={signOut} />
        </>
      }
    >
      {children}
    </SidebarShell>
  );
}

function Footer({ me, balance }: { me: MeView; balance: BalanceView | null }) {
  const [pending, startTransition] = useTransition();
  return (
    <div className="grid gap-3" aria-busy={pending}>
      {/* The team's money: which team, what's left, and (from M1) topping up. */}
      <div className="grid gap-3 rounded-xl border bg-background p-3 shadow-xs">
        {me.teams.length > 1 ? (
          <Field className="gap-1.5">
            <FieldLabel htmlFor="team" className="text-xs text-muted-foreground">
              Team
            </FieldLabel>
            <NativeSelect
              id="team"
              size="sm"
              className="w-full"
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
        ) : (
          <p className="text-sm font-medium">{me.team.name} team</p>
        )}
        <div className="flex items-end justify-between gap-2">
          <div className="grid">
            <span className="text-xs text-muted-foreground">Available to send</span>
            <span className="font-heading text-xl font-semibold tabular-nums">{balance ? money(balance.availableCents) : "–"}</span>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={0}>
                <Button variant="outline" size="sm" disabled>
                  <PlusIcon /> Top up
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>Card and invoice top-ups arrive in M1.</TooltipContent>
          </Tooltip>
        </div>
      </div>
      {me.devUsers ? (
        <Field className="gap-1.5 px-1">
          <FieldLabel htmlFor="viewing-as" className="text-xs font-normal text-muted-foreground">
            Viewing as (development)
          </FieldLabel>
          <NativeSelect
            id="viewing-as"
            size="sm"
            className="w-full"
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
