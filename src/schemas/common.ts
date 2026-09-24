import { z } from "zod";

export const Id = z.uuid();
/** Money is always integer cents, USD. */
export const Cents = z.number().int();
export const Timestamp = z.iso.datetime();

export const Page = z.object({
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(500).default(100),
});
