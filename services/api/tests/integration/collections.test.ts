import { createChannelRegistry } from "@gifting/channels";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { address, fakeOrders, recordingChannel, tokenOf } from "./fakes";
import { createAndSubmit, type Harness, IMANI, MAYA, people, send, startHarness } from "./harness";

// Company collections (plan: build-your-own-collection.md). Fictional data only.
let h: Harness;
const email = recordingChannel();
const shop = fakeOrders(4500);

beforeAll(async () => {
  h = await startHarness({ channels: createChannelRegistry([email.channel]), orders: shop.placer });
});

afterAll(async () => {
  await h?.close();
});

type Headers = Record<string, string>;
type Body = { name?: string; budgetBandCents?: number; rules?: { tags?: string[]; brands?: string[]; skus?: string[] } };
const input = (b: Body = {}) => ({
  name: b.name ?? "Desk treats",
  budgetBandCents: b.budgetBandCents ?? 5000,
  rules: { tags: [], brands: [], skus: [], ...b.rules },
});
const create = (b: Body = {}, headers: Headers = MAYA, extra: Record<string, unknown> = {}) =>
  h.app.inject({ method: "POST", url: "/v1/collections", headers, payload: { ...input(b), ...extra } });
const update = (id: string, b: Body = {}, headers: Headers = MAYA) => h.app.inject({ method: "PUT", url: `/v1/collections/${id}`, headers, payload: input(b) });
const archive = (id: string, headers: Headers = MAYA) => h.app.inject({ method: "POST", url: `/v1/collections/${id}/archive`, headers });
const list = (headers: Headers = MAYA) => h.app.inject({ method: "GET", url: "/v1/collections", headers });
const items = (id: string, budget?: number) => h.app.inject({ method: "GET", url: `/v1/collections/${id}/items${budget ? `?budget=${budget}` : ""}`, headers: MAYA });
const skusOf = (res: { json: () => { items: { variants: { sku: string }[] }[] } }) => res.json().items.flatMap((p) => p.variants.map((v) => v.sku));

describe("building a collection", () => {
  it("saves picked products, tags and brands for the whole company, and lists it first", async () => {
    const res = await create({ name: "Mugs and candles", rules: { skus: ["BL-MUG-PAIR"], brands: ["Cedar & Pine"] } });
    expect(res.statusCode).toBe(200);
    const col = res.json();
    expect(col).toMatchObject({ name: "Mugs and candles", owner: "company-lumen-labs", budgetBandCents: 5000, itemCount: 4 });
    expect(await h.c.collections.findOne({ _id: col.id })).toMatchObject({ createdBy: "user-maya", archivedAt: null, countries: ["US"] });
    expect(skusOf(await items(col.id)).sort()).toEqual(["BL-MUG-PAIR", "CP-CANDLE-CEDAR", "CP-CANDLE-TRIO", "CP-DIFFUSER-LAV"]);

    // Another member of the company sees it too, ahead of the platform's.
    const theirs = (await list(IMANI)).json().collections;
    expect(theirs[0]).toMatchObject({ id: col.id });
    expect(theirs.some((c: { owner: string }) => c.owner === "platform")).toBe(true);
  });

  it("offers only what fits the gift's budget and is in stock", async () => {
    const col = (await create({ name: "Big and small", budgetBandCents: 8000, rules: { skus: ["TH-KIT-DAYHIKE", "BL-TEA-SAMPLER"] } })).json();
    expect(skusOf(await items(col.id, 3000))).toEqual(["BL-TEA-SAMPLER"]);
    expect(skusOf(await items(col.id, 8000)).sort()).toEqual(["BL-TEA-SAMPLER", "TH-KIT-DAYHIKE"]);
  });

  it("edits a collection, and the change reaches its items", async () => {
    const col = (await create({ name: "To edit", rules: { tags: ["outdoors"] } })).json();
    const res = await update(col.id, { name: "Edited", budgetBandCents: 6000, rules: { skus: ["BL-MUG-PAIR"] } }, IMANI);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id: col.id, name: "Edited", budgetBandCents: 6000, itemCount: 1 });
    expect(await h.c.collections.findOne({ _id: col.id })).toMatchObject({ createdBy: "user-maya", updatedBy: "user-imani" });
  });

  it("archives a collection: hidden from the list and new campaigns; archiving again changes nothing", async () => {
    const col = (await create({ name: "To archive", rules: { tags: ["food"] } })).json();
    expect((await archive(col.id)).statusCode).toBe(200);
    expect((await archive(col.id)).statusCode).toBe(200);
    expect((await list()).json().collections.map((c: { id: string }) => c.id)).not.toContain(col.id);

    const { created } = await createAndSubmit(h.app, MAYA, send({ gift: { kind: "collection", collectionId: col.id, budgetCents: 5000 } }));
    expect(created.statusCode).toBe(422);
    expect(created.json().error.code).toBe("collection_archived");
    expect((await update(col.id, { name: "Back again", rules: { tags: ["food"] } })).statusCode).toBe(404);
    // Its name is free again.
    expect((await create({ name: "To archive", rules: { tags: ["home"] } })).statusCode).toBe(200);
  });
});

describe("sending from a company collection", () => {
  it("sends, holds and lets the recipient choose a picked product", async () => {
    const col = (await create({ name: "Send me", rules: { skus: ["BL-MUG-PAIR", "BL-TEA-SAMPLER"] } })).json();
    const before = email.sent.length;
    const { submitted } = await createAndSubmit(h.app, MAYA, send({ recipientIds: people(1), gift: { kind: "collection", collectionId: col.id, budgetCents: 5000 } }));
    expect(submitted?.statusCode).toBe(200);
    const token = tokenOf(email.sent[before]!);

    const offered = await h.app.inject({ method: "GET", url: `/v1/r/${token}/items` });
    expect(offered.json().items.map((p: { sku: string }) => p.sku).sort()).toEqual(["BL-MUG-PAIR", "BL-TEA-SAMPLER"]);
    const redeemed = await h.app.inject({ method: "POST", url: `/v1/r/${token}/redeem`, payload: { sku: "BL-MUG-PAIR", address }, remoteAddress: "10.9.0.1" });
    expect(redeemed.statusCode).toBe(200);
  });

  it("still lets a recipient choose after the collection is archived", async () => {
    const col = (await create({ name: "Archived after sending", rules: { skus: ["BL-TEA-SAMPLER"] } })).json();
    const before = email.sent.length;
    const { submitted } = await createAndSubmit(h.app, MAYA, send({ recipientIds: people(1), gift: { kind: "collection", collectionId: col.id, budgetCents: 5000 } }));
    expect(submitted?.statusCode).toBe(200);
    const token = tokenOf(email.sent[before]!);
    await archive(col.id);

    const offered = await h.app.inject({ method: "GET", url: `/v1/r/${token}/items` });
    expect(offered.json().items.map((p: { sku: string }) => p.sku)).toEqual(["BL-TEA-SAMPLER"]);
    const redeemed = await h.app.inject({ method: "POST", url: `/v1/r/${token}/redeem`, payload: { sku: "BL-TEA-SAMPLER", address }, remoteAddress: "10.9.0.2" });
    expect(redeemed.statusCode).toBe(200);
  });
});

describe("what is refused", () => {
  it("treats another company's collection as not found, whatever the body says", async () => {
    await h.c.collections.insertOne({
      _id: "col-other-company",
      owner: "company-orbit-studio",
      name: "Theirs",
      rules: { tags: ["food"], brands: [], skus: [], pinnedSkus: [] },
      countries: ["US"],
      budgetBandCents: 5000,
      archivedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    expect((await list()).json().collections.map((c: { id: string }) => c.id)).not.toContain("col-other-company");
    expect((await items("col-other-company")).statusCode).toBe(404);
    expect((await update("col-other-company", { name: "Mine now", rules: { tags: ["home"] } })).statusCode).toBe(404);
    expect((await archive("col-other-company")).statusCode).toBe(404);
    const { created } = await createAndSubmit(h.app, MAYA, send({ gift: { kind: "collection", collectionId: "col-other-company", budgetCents: 5000 } }));
    expect(created.statusCode).toBe(404);

    // Naming another company in the body changes nothing: it is saved for the caller's company.
    const res = await create({ name: "Owner from the body", rules: { tags: ["food"] } }, MAYA, { owner: "company-orbit-studio" });
    expect(res.json().owner).toBe("company-lumen-labs");
    expect(await h.c.collections.findOne({ _id: "col-other-company" })).toMatchObject({ name: "Theirs", archivedAt: null });
  });

  it("never changes a platform collection", async () => {
    expect((await update("col-treats", { name: "Hijacked", rules: { tags: ["home"] } })).statusCode).toBe(404);
    expect((await archive("col-treats")).statusCode).toBe(404);
    expect(await h.c.collections.findOne({ _id: "col-treats" })).toMatchObject({ name: "Treats & tea" });
  });

  it("refuses empty rules, a bad name or band, and a name already used, and writes nothing", async () => {
    await create({ name: "Taken Name", rules: { tags: ["food"] } });
    const total = await h.c.collections.countDocuments();
    const bad = [
      await create({ name: "Empty", rules: {} }),
      await create({ name: " ", rules: { tags: ["food"] } }),
      await create({ name: "x".repeat(121), rules: { tags: ["food"] } }),
      await create({ name: "Too cheap", budgetBandCents: 100, rules: { tags: ["food"] } }),
    ];
    expect(bad.map((r) => r.statusCode)).toEqual([400, 400, 400, 400]);
    const dup = await create({ name: "taken name", rules: { tags: ["home"] } });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error.code).toBe("collection_name_taken");
    expect(await h.c.collections.countDocuments()).toBe(total);
  });
});
