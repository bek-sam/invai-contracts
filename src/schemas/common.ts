import { z } from "zod";

export const Id = z.uuid();
export type Id = z.infer<typeof Id>;

/** Money is always integer cents, USD. */
export const Cents = z.number().int();
/** ISO 8601 timestamp with offset, e.g. 2026-09-24T14:03:00.000Z. */
export const Timestamp = z.iso.datetime({ offset: true });
/** Calendar day, YYYY-MM-DD, in the shop's timezone. */
export const DateOnly = z.iso.date();
/** Physical sizes are inches unless the field name ends in Px or Oz. */
export const Inches = z.number().positive();
/** A share in [0, 1] (utilization, rates, confidence). Percent fields are named *Pct. */
export const Ratio = z.number().min(0).max(1);

export const Page = z.object({
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(500).default(100),
});
export type PageInput = z.input<typeof Page>;

/** Standard list output. `nextCursor` is opaque; pass it back as `cursor`. */
export function paginated<T extends z.ZodType>(item: T) {
  return z.object({ items: z.array(item), nextCursor: z.string().nullable() });
}

export const Period = z.object({ from: Timestamp, to: Timestamp });
export type Period = z.infer<typeof Period>;

export const SortDir = z.enum(["asc", "desc"]);

/** Buyer or shop address. Buyer addresses are PII: encrypted at rest, purged 30 days after delivery. */
export const Address = z.object({
  name: z.string(),
  company: z.string().nullable(),
  street1: z.string(),
  street2: z.string().nullable(),
  city: z.string(),
  state: z.string(),
  zip: z.string(),
  country: z.string().length(2).default("US"),
  phone: z.string().nullable(),
  email: z.email().nullable(),
});
export type Address = z.infer<typeof Address>;

/** Async work handed to the worker. Poll production.jobs.get or subscribe to `job.progress`. */
export const JobRef = z.object({ jobId: Id });
export type JobRef = z.infer<typeof JobRef>;

export const Ok = z.object({ ok: z.literal(true) });

/** Reference to a design/blank/etc. in denormalized API output. */
export const NamedRef = z.object({ id: Id, name: z.string() });
export type NamedRef = z.infer<typeof NamedRef>;
