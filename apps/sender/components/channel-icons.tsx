import type { ChannelKind } from "@gifting/domain";

import { CHANNEL } from "@/lib/catalog";

export function ChannelIcons({ channels }: { channels: readonly ChannelKind[] }) {
  return (
    <span className="flex gap-1.5 text-muted-foreground">
      {channels.map((c) => {
        const { icon: Icon, label } = CHANNEL[c];
        return (
          <span key={c} title={label}>
            <Icon className="size-4" aria-hidden />
            <span className="sr-only">{label}</span>
          </span>
        );
      })}
    </span>
  );
}
