import type { ChannelKind, ProductCategory } from "@gifting/domain";
import {
  CoffeeIcon,
  CookieIcon,
  FlameIcon,
  HashIcon,
  LinkIcon,
  type LucideIcon,
  MailIcon,
  MessageSquareIcon,
  MountainIcon,
  QrCodeIcon,
  UsersIcon,
} from "lucide-react";

// `tile` is the product art colour, from the theme's tile tokens.
export const CATEGORY: Record<ProductCategory, { label: string; icon: LucideIcon; tile: string }> = {
  food: { label: "Food & treats", icon: CookieIcon, tile: "bg-tile-food text-tile-food-foreground" },
  home: { label: "Home", icon: FlameIcon, tile: "bg-tile-home text-tile-home-foreground" },
  drink: { label: "Tea & drinkware", icon: CoffeeIcon, tile: "bg-tile-drink text-tile-drink-foreground" },
  outdoors: { label: "Outdoors", icon: MountainIcon, tile: "bg-tile-outdoors text-tile-outdoors-foreground" },
};

export const CHANNEL: Record<ChannelKind, { label: string; note: string; icon: LucideIcon }> = {
  email: { label: "Email", note: "To their work inbox", icon: MailIcon },
  sms: { label: "SMS", note: "A text with the link", icon: MessageSquareIcon },
  slack: { label: "Slack", note: "A direct message", icon: HashIcon },
  teams: { label: "Teams", note: "A chat message", icon: UsersIcon },
  link: { label: "Gift link", note: "You share it yourself", icon: LinkIcon },
  qr: { label: "QR code", note: "Print it or show it", icon: QrCodeIcon },
};

export const BUDGETS = [2500, 5000, 7500, 10_000] as const;
