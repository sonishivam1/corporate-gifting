"use server";

import type { DecisionResultView, EstimateView, RecipientImportInput, RecipientImportView, SendInput, SubmitResultView } from "@gifting/domain";
import { revalidatePath } from "next/cache";

import { ApiCallError, createCampaign, decideCampaign, estimateSend, importRecipients, submitCampaign } from "@/lib/api";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string };

async function attempt<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    if (err instanceof ApiCallError) return { ok: false, code: err.code, message: err.message };
    return { ok: false, code: "unexpected", message: "Something went wrong. Try again." };
  }
}

export async function estimateAction(input: SendInput): Promise<ActionResult<EstimateView>> {
  return attempt(() => estimateSend(input));
}

/**
 * Saves the campaign and sends it. The idempotency key comes from the open
 * send flow, so a double click or a retry after a timeout reuses the same
 * campaign; submitting it again changes nothing.
 */
export async function sendAction(input: SendInput, idempotencyKey: string): Promise<ActionResult<SubmitResultView>> {
  const result = await attempt(async () => {
    const { id } = await createCampaign(input, idempotencyKey);
    return submitCampaign(id);
  });
  revalidatePath("/", "layout");
  return result;
}

/** A recipient list from a file: everyone joins the company's directory. */
export async function importRecipientsAction(input: RecipientImportInput): Promise<ActionResult<RecipientImportView>> {
  return attempt(() => importRecipients(input));
}

export async function decideAction(id: string, decision: "approve" | "decline"): Promise<ActionResult<DecisionResultView>> {
  const result = await attempt(() => decideCampaign(id, decision));
  revalidatePath("/", "layout");
  return result;
}
