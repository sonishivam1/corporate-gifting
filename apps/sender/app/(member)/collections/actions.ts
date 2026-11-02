"use server";

import type { CollectionInput, CollectionView } from "@gifting/domain";
import { revalidatePath } from "next/cache";

import { ApiCallError, archiveCollection, createCollection, updateCollection } from "@/lib/api";

import type { ActionResult } from "../campaigns/actions";

async function attempt<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    if (err instanceof ApiCallError) return { ok: false, code: err.code, message: err.message };
    return { ok: false, code: "unexpected", message: "Something went wrong. Try again." };
  }
}

/** Saves a company collection: a new one, or changes to `id`. */
export async function saveCollectionAction(input: CollectionInput, id?: string): Promise<ActionResult<CollectionView>> {
  const result = await attempt(() => (id ? updateCollection(id, input) : createCollection(input)));
  revalidatePath("/", "layout");
  return result;
}

export async function archiveCollectionAction(id: string): Promise<ActionResult<{ archived: true }>> {
  const result = await attempt(() => archiveCollection(id));
  revalidatePath("/", "layout");
  return result;
}
