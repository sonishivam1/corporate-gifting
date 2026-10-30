import { z } from "zod";

/** A US shipping address. US only for now; the commerce platform checks the rest. */
export const address = z.object({
  name: z.string().trim().min(1).max(120),
  line1: z.string().trim().min(1).max(200),
  line2: z.string().trim().max(200).nullable(),
  city: z.string().trim().min(1).max(100),
  region: z.string().length(2),
  postalCode: z.string().regex(/^\d{5}(-\d{4})?$/, "ZIP code"),
  country: z.literal("US"),
});
export type Address = z.infer<typeof address>;
