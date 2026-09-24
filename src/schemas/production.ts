import { z } from "zod";
import { JOB_STATES, ORDER_ITEM_STATES, SHEET_STATES, STATIONS } from "../states";
import { Placement } from "./catalog";
import { Cents, Id, Inches, Ratio, Timestamp } from "./common";

export const Job = z.object({
  id: Id,
  kind: z.enum([
    "build_sheets",
    "regenerate_sheet",
    "render_artwork",
    "csv_import",
    "batch_labels",
    "listing_drafts",
    "profit_recompute",
    "sync",
  ]),
  status: z.enum(JOB_STATES),
  progress: Ratio,
  message: z.string().nullable(),
  /** Ids produced by the job (sheet ids, draft ids, ...). */
  resultIds: z.array(Id),
  error: z.string().nullable(),
  createdAt: Timestamp,
  finishedAt: Timestamp.nullable(),
});
export type Job = z.infer<typeof Job>;

export const BATCH_EXCLUSION_REASONS = [
  "needs_mapping",
  "needs_artwork",
  "artwork_qa_failed",
  "on_hold",
  "cancelled",
  "already_on_sheet",
  "no_print_file",
  "oversize",
] as const;

export const BatchOptions = z.object({
  /** Include items whose order ship-by is at or before this instant. */
  dueBefore: Timestamp,
  rushFirst: z.boolean().default(true),
  includeReprints: z.boolean().default(true),
  vendorConnectionId: Id.nullable().default(null), // null = default vendor
  /** Restrict to these items; otherwise every eligible `ready` item. */
  orderItemIds: z.array(Id).optional(),
  maxSheets: z.number().int().positive().nullable().default(null),
});

export const BatchPreviewItem = z.object({
  orderItemId: Id,
  orderId: Id,
  orderNo: z.string(),
  designName: z.string(),
  placement: Placement,
  widthIn: Inches,
  heightIn: Inches,
  shipBy: Timestamp,
  isRush: z.boolean(),
  isReprint: z.boolean(),
});

export const BatchPreview = z.object({
  items: z.array(BatchPreviewItem),
  excluded: z.array(
    z.object({ orderItemId: Id, orderNo: z.string(), reason: z.enum(BATCH_EXCLUSION_REASONS) }),
  ),
  sheetWidthIn: Inches,
  estimatedSheets: z.number().int().nonnegative(),
  estimatedLengthIn: z.number().nonnegative(),
  estimatedUtilization: Ratio,
  estimatedCost: Cents,
});
export type BatchPreview = z.infer<typeof BatchPreview>;

/** One copy of one design on a sheet; the QR code encodes the transfer id. */
export const SheetPlacement = z.object({
  transferId: Id,
  orderItemId: Id,
  orderNo: z.string(),
  designName: z.string(),
  size: z.string(),
  color: z.string(),
  xIn: z.number().nonnegative(),
  yIn: z.number().nonnegative(),
  widthIn: Inches,
  heightIn: Inches,
  rotated: z.boolean(),
  isReprint: z.boolean(),
  /** Set when the item was cancelled after nesting; the transfer is scrap. */
  scrapped: z.boolean(),
});
export type SheetPlacement = z.infer<typeof SheetPlacement>;

export const GangSheet = z.object({
  id: Id,
  batchId: Id,
  sheetNo: z.number().int().positive(),
  name: z.string(), // e.g. "2026-09-24 #1"
  vendorConnectionId: Id.nullable(),
  vendorName: z.string().nullable(),
  widthIn: Inches,
  lengthIn: z.number().nonnegative(),
  utilization: Ratio,
  status: z.enum(SHEET_STATES),
  transferCount: z.number().int().nonnegative(),
  reprintCount: z.number().int().nonnegative(),
  files: z.object({
    pngKey: z.string().nullable(),
    pdfKey: z.string().nullable(),
    previewKey: z.string().nullable(),
  }),
  cost: Cents,
  tracking: z.object({ carrier: z.string(), code: z.string() }).nullable(),
  sentAt: Timestamp.nullable(),
  acknowledgedAt: Timestamp.nullable(),
  printedAt: Timestamp.nullable(),
  shippedAt: Timestamp.nullable(),
  receivedAt: Timestamp.nullable(),
  error: z.string().nullable(),
  createdAt: Timestamp,
  updatedAt: Timestamp,
});
export type GangSheet = z.infer<typeof GangSheet>;

export const GangSheetDetail = GangSheet.extend({ placements: z.array(SheetPlacement) });
export type GangSheetDetail = z.infer<typeof GangSheetDetail>;

export const SheetDownloadUrls = z.object({
  png: z.url().nullable(),
  pdf: z.url().nullable(),
  preview: z.url().nullable(),
  expiresAt: Timestamp,
});

export const QueueItem = z.object({
  orderItemId: Id,
  orderId: Id,
  orderNo: z.string(),
  state: z.enum(ORDER_ITEM_STATES),
  shipBy: Timestamp,
  isRush: z.boolean(),
  isReprint: z.boolean(),
  design: z.object({ id: Id, name: z.string(), code: z.string() }),
  placement: Placement,
  blank: z.object({
    variantId: Id,
    brand: z.string(),
    style: z.string(),
    color: z.string(),
    size: z.string(),
  }),
  artworkPreviewKey: z.string().nullable(),
  transferId: Id.nullable(),
  sheetId: Id.nullable(),
  sheetName: z.string().nullable(),
  binCode: z.string().nullable(),
  /** Other units in the same order still open, so packers know when a tote is complete. */
  orderOpenUnits: z.number().int().nonnegative(),
});
export type QueueItem = z.infer<typeof QueueItem>;

export const StationQueue = z.object({
  station: z.enum(STATIONS),
  items: z.array(QueueItem),
  nextCursor: z.string().nullable(),
  counts: z.object({
    waiting: z.number().int().nonnegative(),
    doneToday: z.number().int().nonnegative(),
  }),
});

export const SCAN_ACTIONS = ["pick", "press", "qc_pass", "qc_fail", "pack"] as const;

/**
 * A station scan. Generated on the tablet, queued in IndexedDB while offline, replayed in
 * order. `clientScanId` makes replays idempotent: the server returns the stored result for
 * a repeated id. Codes are the raw scanner strings: a transfer QR (`T:<transferId>`), a
 * blank label (`B:<blankVariantId>` or a supplier UPC), or a bin (`BIN:<code>`).
 */
export const ScanInput = z.object({
  clientScanId: Id,
  station: z.enum(STATIONS),
  stationId: Id.optional(), // taken from the floor session when omitted
  /** The transfer QR, or the item's transfer id when the tablet already knows it. */
  transferCode: z.string().min(1),
  /** Blank label, tote or bin code scanned second. Required at press; optional elsewhere. */
  blankCode: z.string().nullable().default(null),
  action: z.enum(SCAN_ACTIONS).optional(), // defaults to the station's action
  scannedAt: Timestamp,
});
export type ScanInput = z.infer<typeof ScanInput>;

export const MISMATCH_REASONS = [
  "unknown_transfer",
  "unknown_blank",
  "wrong_design",
  "wrong_size",
  "wrong_color",
  "wrong_order",
  "wrong_station",
  "already_processed",
  "not_yet_received",
  "item_on_hold",
  "item_cancelled",
  "transfer_scrapped",
  "stale_scan",
  "blank_required",
] as const;

export const NEXT_ACTIONS = [
  "pick_blank",
  "press",
  "qc",
  "pack",
  "ship",
  "wait_for_transfer",
  "reprint",
  "hold",
  "nothing",
] as const;

export const ScanResult = z.object({
  ok: z.boolean(),
  clientScanId: Id,
  mismatch: z.enum(MISMATCH_REASONS).nullable(),
  message: z.string(), // shown on the red/green screen, localized by the client using `mismatch`
  transferId: Id.nullable(),
  orderItemId: Id.nullable(),
  orderId: Id.nullable(),
  orderNo: z.string().nullable(),
  design: z.object({ id: Id, name: z.string(), code: z.string() }).nullable(),
  /** What the transfer expects. */
  expected: z
    .object({
      blankVariantId: Id,
      brand: z.string(),
      style: z.string(),
      color: z.string(),
      size: z.string(),
    })
    .nullable(),
  /** What was scanned as the blank, when it resolved. */
  scannedBlank: z
    .object({
      blankVariantId: Id,
      brand: z.string(),
      style: z.string(),
      color: z.string(),
      size: z.string(),
    })
    .nullable(),
  placement: Placement.nullable(),
  isReprint: z.boolean(),
  binCode: z.string().nullable(),
  itemState: z.enum(ORDER_ITEM_STATES).nullable(),
  nextAction: z.enum(NEXT_ACTIONS),
  /** Units of this order still open after this scan. */
  orderOpenUnits: z.number().int().nonnegative().nullable(),
});
export type ScanResult = z.infer<typeof ScanResult>;

export const REPRINT_REASONS = [
  "misprint",
  "peel",
  "ghosting",
  "color_off",
  "wrong_placement",
  "transfer_damaged",
  "blank_damaged",
  "wrong_blank",
  "press_error",
  "customer_request",
  "lost",
  "other",
] as const;

export const QcInput = z.object({
  orderItemId: Id,
  result: z.enum(["pass", "fail"]),
  reprintReason: z.enum(REPRINT_REASONS).optional(), // required on fail
  /** Whether the blank can be reused (fail only). */
  blankReusable: z.boolean().default(false),
  note: z.string().nullable().default(null),
  stationId: Id.optional(),
});

export const Reprint = z.object({
  id: Id,
  orderItemId: Id,
  orderNo: z.string(),
  reason: z.enum(REPRINT_REASONS),
  note: z.string().nullable(),
  status: z.enum(["requested", "on_sheet", "done", "cancelled"]),
  originalTransferId: Id.nullable(),
  newTransferId: Id.nullable(),
  requestedBy: Id.nullable(),
  requestedAt: Timestamp,
});
export type Reprint = z.infer<typeof Reprint>;

/** A tote or bin holding one order's units between stations. */
export const Bin = z.object({
  code: z.string(),
  locationId: Id.nullable(),
  orderId: Id.nullable(),
  orderNo: z.string().nullable(),
  unitsInBin: z.number().int().nonnegative(),
  unitsExpected: z.number().int().nonnegative(),
  station: z.enum(STATIONS).nullable(),
  updatedAt: Timestamp,
});
export type Bin = z.infer<typeof Bin>;
