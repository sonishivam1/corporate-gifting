"use client";

import { LogOut, type LucideIcon } from "lucide-react";
import type { ComponentType, ReactNode } from "react";

import { Avatar, AvatarFallback } from "@gifting/ui/components/avatar";
import { Button } from "@gifting/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@gifting/ui/components/dropdown-menu";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "")).toUpperCase() || "?";
}

export type UserMenuLink = { href: string; label: string; icon: LucideIcon };
type LinkComponent = ComponentType<{ href: string; className?: string; children: ReactNode }>;

/**
 * The signed-in person in the header, their pages (`links`, opened with the
 * app's router link `linkAs`), and sign out. Sign-out is a form post to the
 * app's server action, never a link, so another site can't sign you out.
 */
function UserMenu({
  name,
  email,
  detail,
  links = [],
  linkAs: LinkAs = "a" as unknown as LinkComponent,
  signOut,
}: {
  name: string;
  email: string;
  detail?: string;
  links?: UserMenuLink[];
  linkAs?: LinkComponent;
  signOut: () => Promise<void>;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="lg" className="gap-2 px-2" aria-label={`Account menu for ${name}`}>
          <Avatar className="size-7">
            <AvatarFallback className="bg-accent text-xs font-semibold text-accent-foreground">{initials(name)}</AvatarFallback>
          </Avatar>
          <span className="hidden max-w-40 truncate text-sm sm:inline">{name}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="truncate font-medium">{name}</span>
          <span className="truncate text-xs font-normal text-muted-foreground">{email}</span>
          {detail ? <span className="truncate text-xs font-normal text-muted-foreground">{detail}</span> : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {links.length ? (
          <>
            {links.map(({ href, label, icon: Icon }) => (
              <DropdownMenuItem key={href} asChild>
                <LinkAs href={href}>
                  <Icon />
                  {label}
                </LinkAs>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
          </>
        ) : null}
        <form action={signOut}>
          <DropdownMenuItem asChild>
            <button type="submit" className="w-full">
              <LogOut />
              Sign out
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export { UserMenu };
