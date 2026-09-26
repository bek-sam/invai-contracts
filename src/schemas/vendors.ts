import { z } from "zod";
import { Cents, Id, Inches, Timestamp } from "./common";
import { GangSheet, SheetPlacement } from "./production";

/** The vendor's output spec; drives imaging /nest and /compose. */
export const SheetSpec = z.object({
  /** Bounds match invai-imaging's /nest and /compose (T-9-5): film ≤ 60in wide, ≤ 240in long. */
  widthIn: Inches.max(60),
  maxLengthIn: Inches.max(240),
  format: z.enum(["png", "pdf"]),
  dpi: z.number().int().min(36).max(1200),
  /** Cents per linear inch of film; total = lengthIn × pricePerInch. */
  pricePerInch: Cents.nonnegative(),
  spacingIn: z.number().nonnegative(),
  marginIn: z.number().nonnegative(),
  labelGapIn: z.number().nonnegative().default(0.125), // was hardcoded LABEL_GAP_IN=0.04 in compose.py
  colorProfile: z.string().nullable(),
  /** Vendor's own note, e.g. "mirror not needed, we mirror at RIP". */
  notes: z.string().nullable(),
});
export type SheetSpec = z.infer<typeof SheetSpec>;

/**
 * B-80: `app/pdf.py` (invai-imaging) no longer relies on `/UserUnit` for long PDF pages — some
 * RIPs/viewers ignore it, so a long sheet printed at the wrong size. Decision: cap, not split.
 * PNG has no page-size concept, so it keeps its own (higher) ceiling; this only bounds PDF.
 *
 * This can't be a `.refine()` on `SheetSpec` itself: `SheetSpec.partial()` is used for spec
 * updates and invites (`VendorInviteInput` below, and the `vendors.update` contract), and zod v4
 * drops `.partial()`/`.pick()`/etc. from an object once it carries a refinement. A partial spec
 * update can't be checked in isolation anyway (it may omit `format` or `maxLengthIn` entirely),
 * so this runs on the *complete* spec (existing + update merged) at sheet-spec save —
 * `invai-backend/src/modules/vendors/service.ts`. `write_image_pdf` keeps its own `ImageError`
 * as a second line of defense in case a sheet is ever queued with a spec that skipped this.
 */
export const PDF_MAX_LENGTH_IN = 200;

export function sheetSpecPdfCapError(spec: Pick<SheetSpec, "format" | "maxLengthIn">): string | null {
  if (spec.format === "pdf" && spec.maxLengthIn > PDF_MAX_LENGTH_IN) {
    return `PDF sheets are capped at ${PDF_MAX_LENGTH_IN}in; use PNG for longer runs.`;
  }
  return null;
}

export const DEFAULT_SHEET_SPEC: SheetSpec = {
  widthIn: 22,
  maxLengthIn: 240,
  format: "png",
  dpi: 300,
  pricePerInch: 30,
  spacingIn: 0.25,
  marginIn: 0.25,
  labelGapIn: 0.125,
  colorProfile: null,
  notes: null,
};

export const VENDOR_CONNECTION_STATUSES = ["invited", "active", "paused"] as const;

/** Shop side: a DTF vendor this shop sends sheets to. */
export const VendorConnection = z.object({
  id: Id,
  name: z.string(),
  email: z.email(),
  /** Set once the vendor accepted the invite and has a portal org. Null = email + link delivery. */
  vendorOrgId: Id.nullable(),
  status: z.enum(VENDOR_CONNECTION_STATUSES),
  delivery: z.enum(["portal", "email"]),
  spec: SheetSpec,
  isDefault: z.boolean(),
  /** Typical days from sent to received, used for capacity and at-risk math. */
  turnaroundDays: z.number().int().nonnegative(),
  sheetsOpen: z.number().int().nonnegative(),
  invitedAt: Timestamp,
  acceptedAt: Timestamp.nullable(),
  createdAt: Timestamp,
});
export type VendorConnection = z.infer<typeof VendorConnection>;

export const VendorInviteInput = z.object({
  name: z.string().min(1),
  email: z.email(),
  spec: SheetSpec.partial().default({}),
  isDefault: z.boolean().default(false),
  turnaroundDays: z.number().int().nonnegative().default(2),
});

/** Vendor side: a sheet in the inbox, with the sending shop. */
export const VendorInboxSheet = GangSheet.extend({
  shop: z.object({ orgId: Id, name: z.string() }),
  spec: SheetSpec,
});
export type VendorInboxSheet = z.infer<typeof VendorInboxSheet>;

export const VendorInboxSheetDetail = VendorInboxSheet.extend({
  placements: z.array(SheetPlacement),
});

export const VendorShop = z.object({
  orgId: Id,
  name: z.string(),
  sheetsOpen: z.number().int().nonnegative(),
  sheetsTotal: z.number().int().nonnegative(),
  inchesLast30d: z.number().nonnegative(),
  lastSheetAt: Timestamp.nullable(),
});
export type VendorShop = z.infer<typeof VendorShop>;
