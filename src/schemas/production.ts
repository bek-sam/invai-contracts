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
    "tenant_export",
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
    /**
     * Where the blank sits in the shop (B-32, T-22-4): the shelf label ("A-03-2") and, when the
     * shop keeps blanks in bins, the bin code. Nested here on purpose: `QueueItem.binCode` (below)
     * is the order's pack tote, a different thing. Optional until the backend fills them.
     */
    shelf: z.string().nullable().optional(),
    binCode: z.string().nullable().optional(),
  }),
  artworkPreviewKey: z.string().nullable(),
  transferId: Id.nullable(),
  sheetId: Id.nullable(),
  sheetName: z.string().nullable(),
  binCode: z.string().nullable(),
  /** Other units in the same order still open, so packers know when a tote is complete. */
  orderOpenUnits: z.number().int().nonnegative(),
  /**
   * Transfer age (B-35, T-22-4): DTF transfers lose adhesion as they age (research 10 §DTF:
   * 6–12 months shelf life, flag early). `transferPrintedAt` is the sheet's `printedAt` (or its
   * `receivedAt` when the vendor never reported printing); `transferAgeDays` is whole days since
   * then; `transferAgeWarning` is true past the org's `transferAgeWarnDays` (default 30). A
   * warning never blocks a scan. Optional until the backend fills them.
   */
  transferPrintedAt: Timestamp.nullable().optional(),
  transferAgeDays: z.number().int().nonnegative().nullable().optional(),
  transferAgeWarning: z.boolean().optional(),
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
  "wrong_style",
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
  /**
   * The station is under maintenance (`production.maintenance.start`, B-35, T-22-4). A scan
   * there is a normal blocked result, never a thrown error (architect A4): `ok: false`,
   * `nextAction: "press"` (the unit still needs pressing, at a station that is open). Appended
   * last; consumers keyed on this enum: `invai-floor/src/i18n/{en,es}.ts` `floor.mismatch.*`,
   * `invai-web/src/routes/_app/production/stations.tsx` `mismatch.*`.
   */
  "station_maintenance",
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
  /** What the transfer expects. `shelf` / `binCode` are the blank's location (B-32), as on `QueueItem.blank`. */
  expected: z
    .object({
      blankVariantId: Id,
      brand: z.string(),
      style: z.string(),
      color: z.string(),
      size: z.string(),
      shelf: z.string().nullable().optional(),
      binCode: z.string().nullable().optional(),
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
  /** Same meaning as on `QueueItem` (B-35): shown on the press screen after the transfer scan. */
  transferAgeDays: z.number().int().nonnegative().nullable().optional(),
  transferAgeWarning: z.boolean().optional(),
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

/**
 * Why a station is closed (B-35, T-22-4). Heat presses need platen cleaning, temperature and
 * pressure calibration and the odd repair; `printer_maintenance` covers the in-house printer's
 * daily nozzle check, white-ink agitation and weekly capping-station cleaning (research 10
 * §DTF) when the shop treats the printer as a station.
 */
export const MAINTENANCE_REASONS = [
  "cleaning",
  "calibration",
  "repair",
  "printer_maintenance",
  "other",
] as const;

/**
 * One maintenance window on a station, from `start` to `end` (open while `endedAt` is null).
 * Backed by the production-owned `station_maintenance_events` table, not the tenancy `stations`
 * row (architect A3): every window is its own audited row, and no wave-22 card owns tenancy.
 * While a window is open, scans at that station return `mismatch: "station_maintenance"`.
 */
export const StationMaintenance = z.object({
  id: Id,
  stationId: Id,
  stationName: z.string(),
  reason: z.enum(MAINTENANCE_REASONS),
  note: z.string().nullable(),
  startedAt: Timestamp,
  startedBy: Id.nullable(),
  endedAt: Timestamp.nullable(),
  endedBy: Id.nullable(),
});
export type StationMaintenance = z.infer<typeof StationMaintenance>;

export const MaintenanceStartInput = z.object({
  stationId: Id,
  reason: z.enum(MAINTENANCE_REASONS),
  note: z.string().max(500).nullable().default(null),
});
export type MaintenanceStartInput = z.infer<typeof MaintenanceStartInput>;

/** `started` is false when the station was already under maintenance (idempotent; the open window is returned). */
export const MaintenanceStartResult = z.object({
  maintenance: StationMaintenance,
  started: z.boolean(),
});
export type MaintenanceStartResult = z.infer<typeof MaintenanceStartResult>;

export const MaintenanceEndInput = z.object({
  stationId: Id,
  note: z.string().max(500).nullable().default(null),
});
export type MaintenanceEndInput = z.infer<typeof MaintenanceEndInput>;

/** `ended` is false and `maintenance` is the last closed window (or null) when nothing was open (idempotent). */
export const MaintenanceEndResult = z.object({
  maintenance: StationMaintenance.nullable(),
  ended: z.boolean(),
});
export type MaintenanceEndResult = z.infer<typeof MaintenanceEndResult>;

/** A tote or bin holding one order's units between stations. */
export const Bin = z.object({
  id: Id,
  code: z.string(),
  name: z.string().nullable(),
  archivedAt: Timestamp.nullable(),
  locationId: Id.nullable(),
  orderId: Id.nullable(),
  orderNo: z.string().nullable(),
  unitsInBin: z.number().int().nonnegative(),
  unitsExpected: z.number().int().nonnegative(),
  station: z.enum(STATIONS).nullable(),
  updatedAt: Timestamp,
});
export type Bin = z.infer<typeof Bin>;

export const PackOrderInput = z.object({
  orderId: Id,
  /** Idempotency key, same convention as ReceiveInput.idempotencyKey. Only calls that changed
   * something are stored. A refused call (`PACK_INCOMPLETE`, `FORBIDDEN`, `CONFLICT`) has no
   * effect, and a retry re-evaluates. */
  idempotencyKey: z.string().min(8).max(128),
  /** Present only on the "hand to lead" path (decision 0010). */
  override: z.object({ reason: z.string().min(1).max(500) }).optional(),
});
export type PackOrderInput = z.infer<typeof PackOrderInput>;

export const PackOverride = z.object({
  reason: z.string(),
  by: Id,
  byName: z.string(),
  at: Timestamp,
  missingItemIds: z.array(Id),
});
export type PackOverride = z.infer<typeof PackOverride>;

export const PackOrderResult = z.object({
  orderId: Id,
  packed: z.boolean(),
  /** Non-empty whenever `packed` is false; empty when `packed` is true. */
  missing: z.array(z.object({ orderItemId: Id, state: z.enum(ORDER_ITEM_STATES) })),
  /** Non-null when this call (or the stored call under this key) handed the order to a lead;
   * `packed` is then false (decision 0010: hand-to-lead never marks the order packed). */
  override: PackOverride.nullable(),
});
export type PackOrderResult = z.infer<typeof PackOrderResult>;
