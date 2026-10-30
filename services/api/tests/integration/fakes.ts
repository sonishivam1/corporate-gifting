import type { Channel, GiftMessage } from "@gifting/channels";
import { OrderError, type OrderPlacer, type PlaceOrderInput, type PlacedOrder } from "@gifting/domain";

export const address = { name: "Priya Nair", line1: "200 Sample Ave", line2: null, city: "Austin", region: "TX", postalCode: "78701", country: "US" };

/** An email channel that records what it is asked to send, instead of sending it. */
export function recordingChannel() {
  const sent: GiftMessage[] = [];
  let fail = false;
  const channel: Channel = {
    kind: "email",
    async send(message) {
      if (fail) {
        fail = false;
        throw new Error("provider down");
      }
      sent.push(message);
      return { providerMessageId: `msg-${sent.length}`, status: "sent" };
    },
    async remind(message) {
      sent.push(message);
      return { providerMessageId: `msg-${sent.length}`, status: "sent" };
    },
  };
  return { channel, sent, failNext: () => void (fail = true) };
}

/** A stand-in for the commerce platform's orders. Every order costs `totalCents`, shipping and tax included. */
export function fakeOrders(totalCents = 4500) {
  const orders = new Map<string, PlacedOrder>();
  const calls: PlaceOrderInput[] = [];
  let next: OrderError | "timeout" | null = null;
  const placer: OrderPlacer = {
    async place(input) {
      calls.push(input);
      const existing = orders.get(input.orderNumber);
      if (existing) return existing;
      if (next instanceof OrderError) {
        const err = next;
        next = null;
        throw err;
      }
      const order: PlacedOrder = { orderNumber: input.orderNumber, orderId: `ord-${orders.size + 1}`, totalCents, status: "open" };
      orders.set(order.orderNumber, order);
      if (next === "timeout") {
        next = null;
        throw new OrderError("unavailable", "timed out");
      }
      return order;
    },
    async find(orderNumber) {
      return orders.get(orderNumber) ?? null;
    },
  };
  return { placer, orders, calls, failNext: (err: OrderError | "timeout") => void (next = err) };
}

export const tokenOf = (message: GiftMessage) => /\/r\/([A-Za-z0-9_-]+)/.exec(message.link)![1]!;
