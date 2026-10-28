import type { Channel, ChannelKind } from "./types";

export type ChannelRegistry = {
  get(kind: ChannelKind): Channel;
  has(kind: ChannelKind): boolean;
  kinds(): ChannelKind[];
};

export function createChannelRegistry(channels: readonly Channel[]): ChannelRegistry {
  const byKind = new Map<ChannelKind, Channel>();
  for (const channel of channels) {
    if (byKind.has(channel.kind)) throw new Error(`Two channels registered for ${channel.kind}.`);
    byKind.set(channel.kind, channel);
  }
  return {
    get(kind) {
      const channel = byKind.get(kind);
      if (!channel) throw new Error(`No channel registered for ${kind}.`);
      return channel;
    },
    has: (kind) => byKind.has(kind),
    kinds: () => [...byKind.keys()],
  };
}
