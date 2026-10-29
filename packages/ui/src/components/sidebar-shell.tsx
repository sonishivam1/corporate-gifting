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
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@gifting/ui/components/sidebar";

export type SidebarNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  // "/" is active only on itself; other items also on their sub-pages.
  exact?: boolean;
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
  currentPath,
  linkAs: Link = "a",
  footer,
  children,
}: {
  app: string;
  nav: readonly SidebarNavItem[];
  currentPath: string;
  linkAs?: LinkComponent;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const isActive = (item: SidebarNavItem) =>
    item.exact ? currentPath === item.href : currentPath === item.href || currentPath.startsWith(`${item.href}/`);

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" asChild>
                <Link href="/">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                    <GiftIcon className="size-4" />
                  </span>
                  <span className="grid leading-tight">
                    <span className="truncate font-semibold">Gifting Marketplace</span>
                    <span className="truncate text-xs text-muted-foreground">{app}</span>
                  </span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {nav.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={isActive(item)} tooltip={item.label}>
                      <Link href={item.href}>
                        <item.icon />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        {footer ? <SidebarFooter className="group-data-[collapsible=icon]:hidden">{footer}</SidebarFooter> : null}
      </Sidebar>
      <SidebarInset>
        <header className="flex h-12 items-center gap-2 px-4 sm:px-8">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="h-4" />
          <span className="text-sm text-muted-foreground">{app}</span>
        </header>
        <div className="mx-auto w-full max-w-6xl px-4 pb-12 sm:px-8">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}

export { SidebarShell };
