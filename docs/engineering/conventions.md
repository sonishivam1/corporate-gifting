# Code conventions

## TypeScript

- Strict mode everywhere, with `noUncheckedIndexedAccess`. ES modules only.
- Shapes are Zod schemas in `@gifting/domain`; types are `z.infer<…>`. Don't
  hand-write a type that a schema already describes.
- Money is `Cents` (an integer) plus a currency. Use the helpers in
  `@gifting/domain` (`money.ts`): `toCents`, `formatCents`, `sumCents`. Never
  do arithmetic on decimal dollars.
- Dates are stored as `Date` (UTC). Milestone matching uses `MM-DD` strings
  (`birthdayMonthDay`) computed in the company's time zone.

## API modules

```
services/api/src/modules/<module>/
  routes.ts       defineRoute() calls; thin: parse, scope, call the service
  service.ts      the module's public functions; other modules import only this
  repo.ts         collection access for this module only
  *.test.ts       tests through app.inject() and the service
```

A route:

```ts
export const getGift = defineRoute({
  method: "GET",
  url: "/v1/gifts/:giftId",
  schema: { params: z.object({ giftId: z.string() }), response: giftView },
  async handler({ params, scope }) {
    const gift = await giftsService.get(scope, params.giftId); // scope from the session
    if (!gift) throw new ApiError(404, "gift_not_found", "Gift not found.");
    return gift;
  },
});
```

## Writing data

1. Validate input with Zod (the route does this).
2. Take scope from the session (`companyKey`, `teamKey`, roles), never from
   the body.
3. Re-check inside the write: the filter includes the scope and the expected
   status (`status: { $in: [...] }`), so the database refuses stale writes.
4. Money and status together in one transaction:

```ts
await client.withSession((s) => s.withTransaction(async () => {
  const updated = await gifts.updateOne(
    { _id: giftId, status: "redeeming", version },
    { $set: { status: "redeemed", ctOrderNumber }, $inc: { version: 1 } },
    { session: s },
  );
  if (updated.modifiedCount !== 1) throw new ConflictError("gift changed");
  await ledgerEntries.insertMany(redemptionEntries(gift, actual), { session: s });
}));
```

5. A duplicate-key error on an idempotency key means "already done": return
   the existing result instead of failing.

## Logging

Use `@gifting/logger`, never `console`, in server code, workers and scripts:

```ts
const log = createLogger("gifts", { requestId, companyKey });
log.info({ giftId, status: "redeemed" }, "gift redeemed");
log.error({ err, giftId }, "redemption failed");
```

- Log ids, statuses and codes as fields. Never names, emails, phones,
  birthdays, addresses, gift tokens or codes, keys or connection strings.
- Errors as `{ err }`. Only errors we raised (`AppError`) log their message;
  provider and driver errors log name and code only.
- Redaction in the logger is a safety net, not a licence.

## Apps

- Server components fetch from the API through `lib/api.ts`; client
  components call server actions or the API, never commercetools.
- Import only `@gifting/domain` (types, pure rules) and `@gifting/ui`.
- Shareable page state (filters, tabs) lives in the URL.

## Naming

| Thing | Style | Example |
| --- | --- | --- |
| Files | kebab-case | `gift-status.ts` |
| Collections | camelCase plural | `ledgerEntries` |
| commercetools keys | kebab-case | `gift-order`, `vendor-north-bakery` |
| Error codes | snake_case | `gift_not_found`, `over_budget` |
| Log areas | module name | `gifts`, `ledger`, `ct-events` |
