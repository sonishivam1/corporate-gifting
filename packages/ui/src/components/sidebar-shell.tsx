"use client";

import { GiftIcon, type LucideIcon } from "lucide-react";
import type { ElementType, ReactNode } from "react";

import { Separator } from "@gifting/ui/components/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@gifting/ui/components/sidebar";

/** Roomier than shadcn's compact default: 40px rows, 18px icons, and a primary-tinted active item. */
const ITEM =
  "h-10 gap-3 rounded-lg px-3 text-[0.9375rem] [&_svg]:size-[18px] data-[active=true]:bg-primary/10 data-[active=true]:font-semibold data-[active=true]:text-primary hover:bg-sidebar-accent/70";

export type SidebarNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  // "/" is active only on itself; other items also on their sub-pages.
  exact?: boolean;
  /** Sub-pages that belong to another item (Campaigns is not active on its "Send gifts" page). */
  excludes?: readonly string[];
  /** Not built yet: shown with a "Soon" badge, not a link. */
  soon?: boolean;
};

type LinkComponent = ElementType<{ href: string; className?: string; children?: ReactNode }>;

/**
 * The frame for apps with a side menu: product mark, navigation, a footer
 * slot and the page. Pass the framework's link component (Next's Link) as
 * `linkAs` so navigation stays client-side.
 */
function SidebarShell({
  app,
  nav,
  navLabel = "Menu",
  currentPath,
  linkAs: Link = "a",
  footer,
  context,
  topBar,
  actions,
  children,
}: {
  app: string;
  nav: readonly SidebarNavItem[];
  /** The heading over the menu. */
  navLabel?: string;
  currentPath: string;
  linkAs?: LinkComponent;
  footer?: ReactNode;
  /** The left of the top bar, for example the company being worked in. Defaults to the app's name. */
  context?: ReactNode;
  /** The middle of the top bar, for example search. */
  topBar?: ReactNode;
  /** Shown at the right of the top bar, for example the account menu. */
  actions?: ReactNode;
  children: ReactNode;
}) {
  const under = (path: string) => currentPath === path || currentPath.startsWith(`${path}/`);
  const isActive = (item: SidebarNavItem) =>
    item.exact ? currentPath === item.href : under(item.href) && !(item.excludes ?? []).some(under);

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader className="h-16 justify-center border-b border-sidebar-border px-3">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" asChild className="hover:bg-transparent">
                <Link href="/">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
                    <GiftIcon className="size-5" />
                  </span>
                  <span className="grid leading-tight">
                    <span className="truncate font-heading text-base font-bold">Corporate Gifting</span>
                    <span className="truncate text-xs text-muted-foreground">{app}</span>
                  </span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent className="px-2 pt-3">
          <SidebarGroup>
            <SidebarGroupLabel className="px-3 text-[0.6875rem] font-semibold tracking-wider text-muted-foreground uppercase">{navLabel}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-1">
                {nav.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    {item.soon ? (
                      <>
                        <SidebarMenuButton
                          aria-disabled="true"
                          tooltip={`${item.label} (soon)`}
                          className={`${ITEM} cursor-default text-muted-foreground aria-disabled:opacity-100 hover:bg-transparent hover:text-muted-foreground`}
                        >
                          <item.icon />
                          <span>{item.label}</span>
                        </SidebarMenuButton>
                        <SidebarMenuBadge className="top-2.5 right-2 h-5 rounded-full border bg-background px-2 text-[0.6875rem] font-medium text-muted-foreground">Soon</SidebarMenuBadge>
                      </>
                    ) : (
                      <SidebarMenuButton asChild isActive={isActive(item)} tooltip={item.label} className={ITEM}>
                        <Link href={item.href}>
                          <item.icon />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    )}
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        {footer ? <SidebarFooter className="border-t border-sidebar-border p-3 group-data-[collapsible=icon]:hidden">{footer}</SidebarFooter> : null}
      </Sidebar>
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-16 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur sm:px-6 lg:px-8">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="h-4" />
          <div className="hidden min-w-0 md:flex">{context ?? <span className="text-sm text-muted-foreground">{app}</span>}</div>
          {topBar ? <div className="flex min-w-0 flex-1 justify-center">{topBar}</div> : null}
          {actions ? <div className={topBar ? "flex items-center gap-2" : "ml-auto flex items-center gap-2"}>{actions}</div> : null}
        </header>
        {/* Uses wide screens up to 1600px, so the cards and charts get the room instead of empty margins. */}
        <div className="mx-auto w-full max-w-[1600px] px-4 pb-12 sm:px-6 lg:px-8">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}

export { SidebarShell };
