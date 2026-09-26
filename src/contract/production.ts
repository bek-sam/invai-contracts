import { z } from "zod";
import { DateOnly, Id, JobRef, Page, paginated, Timestamp } from "../schemas/common";
import { OrderItem } from "../schemas/orders";
import {
  BatchOptions,
  BatchPreview,
  Bin,
  GangSheet,
  GangSheetDetail,
  Job,
  PackOrderInput,
  PackOrderResult,
  QcInput,
  REPRINT_REASONS,
  Reprint,
  ScanInput,
  ScanResult,
  SheetDownloadUrls,
  StationQueue,
} from "../schemas/production";
import { ORDER_ITEM_STATES, SHEET_STATES, STATIONS } from "../states";
import { base, proc } from "./_base";

const batches = base.prefix("/batches").router({
  /** Which `ready` items would go on sheets for this cutoff (rush first), and why others are excluded. */
  preview: proc("production.build")
    .route({ method: "POST", path: "/preview" })
    .input(BatchOptions)
    .output(BatchPreview),
  /** Enqueues build-sheets: render artwork -> nest -> compose. Items move ready -> on_sheet when done. */
  build: proc("production.build")
    .route({ method: "POST", path: "/build" })
    .input(BatchOptions.extend({ name: z.string().max(80).optional() }))
    .output(JobRef.extend({ batchId: Id, itemCount: z.number().int().nonnegative() }))
    .errors({ NOTHING_TO_BUILD: { status: 400, message: "No eligible items for this cutoff" } }),
});

const jobs = base.prefix("/jobs").router({
  get: proc("production.read", { auth: "floor" })
    .route({ method: "GET", path: "/{id}" })
    .input(z.object({ id: Id }))
    .output(Job),
});

const sheets = base.prefix("/sheets").router({
  list: proc("production.read", { auth: "floor" })
    .route({ method: "GET", path: "/" })
    .input(
      Page.extend({
        status: z.array(z.enum(SHEET_STATES)).optional(),
        batchId: Id.optional(),
        vendorConnectionId: Id.optional(),
        from: Timestamp.optional(),
        to: Timestamp.optional(),
      }),
    )
    .output(paginated(GangSheet)),
  get: proc("production.read", { auth: "floor" })
    .route({ method: "GET", path: "/{id}" })
    .input(z.object({ id: Id }))
    .output(GangSheetDetail),
  /** Re-nest and re-compose (e.g. after an item was cancelled). Allowed while ready or failed. */
  regenerate: proc("production.build")
    .route({ method: "POST", path: "/{id}/regenerate" })
    .input(z.object({ id: Id }))
    .output(JobRef),
  sendToVendor: proc("production.build")
    .route({ method: "POST", path: "/{id}/send" })
    .input(
      z.object({ id: Id, vendorConnectionId: Id.optional(), note: z.string().max(500).optional() }),
    )
    .output(GangSheet)
    .errors({ NO_VENDOR: { status: 400, message: "No vendor connection; add one under Vendors" } }),
  /** In-house path: skips the vendor entirely. Only succeeds when the company prints in-house
   * and the sheet is `ready`. */
  markPrinting: proc("production.build")
    .route({ method: "POST", path: "/{id}/mark-printing" })
    .input(z.object({ id: Id }))
    .output(GangSheetDetail)
    .errors({ FORBIDDEN: { status: 403, message: "Company does not print in-house" } }),
  /** `printing` -> `printed`. Units then flow to the floor exactly as a vendor-printed sheet
   * does, via the existing `markReceived` (printed -> received is already a valid transition). */
  markPrinted: proc("production.build")
    .route({ method: "POST", path: "/{id}/mark-printed" })
    .input(z.object({ id: Id }))
    .output(GangSheetDetail),
  /** Transfers arrived at the shop: every item on the sheet moves on_sheet -> transfer_in. */
  markReceived: proc("production.receive", { auth: "floor" })
    .route({ method: "POST", path: "/{id}/received" })
    .input(z.object({ id: Id }))
    .output(GangSheet),
  cancel: proc("production.build")
    .route({ method: "POST", path: "/{id}/cancel" })
    .input(z.object({ id: Id }))
    .output(GangSheet),
  downloadUrls: proc("production.read", { auth: "floor" })
    .route({ method: "GET", path: "/{id}/downloads" })
    .input(z.object({ id: Id }))
    .output(SheetDownloadUrls),
  /** Everything on this sheet as order items, for the sort-after-cutting screen. */
  items: proc("production.read", { auth: "floor" })
    .route({ method: "GET", path: "/{id}/items" })
    .input(z.object({ id: Id }))
    .output(z.object({ items: z.array(OrderItem) })),
});

const reprints = base.prefix("/reprints").router({
  list: proc("production.read")
    .route({ method: "GET", path: "/" })
    .input(
      Page.extend({
        status: z.array(z.enum(["requested", "on_sheet", "done", "cancelled"])).optional(),
        reason: z.enum(REPRINT_REASONS).optional(),
        from: Timestamp.optional(),
        to: Timestamp.optional(),
      }),
    )
    .output(paginated(Reprint)),
  /** Request a reprint outside QC (e.g. a lost transfer). The item returns to `ready` flagged `reprint`. */
  request: proc("production.qc", { auth: "floor" })
    .route({ method: "POST", path: "/" })
    .input(
      z.object({
        orderItemId: Id,
        reason: z.enum(REPRINT_REASONS),
        note: z.string().nullable().default(null),
      }),
    )
    .output(Reprint),
  cancel: proc("production.qc")
    .route({ method: "POST", path: "/{id}/cancel" })
    .input(z.object({ id: Id }))
    .output(Reprint),
  /** Reprint reasons over a period, for the analytics card. */
  stats: proc("production.read")
    .route({ method: "GET", path: "/stats" })
    .input(z.object({ from: Timestamp, to: Timestamp }))
    .output(
      z.object({
        total: z.number().int().nonnegative(),
        pressed: z.number().int().nonnegative(),
        rate: z.number().min(0),
        byReason: z.partialRecord(z.enum(REPRINT_REASONS), z.number().int().nonnegative()),
      }),
    ),
  /** Count by reason and by week, for the reasons report chart (`stats` only returns one flat
   * total for the period). */
  reasonsByWeek: proc("production.read")
    .route({ method: "GET", path: "/reasons-by-week" })
    .input(z.object({ from: Timestamp, to: Timestamp }))
    .output(
      z.object({
        weeks: z.array(
          z.object({
            weekStart: DateOnly,
            total: z.number().int().nonnegative(),
            byReason: z.partialRecord(z.enum(REPRINT_REASONS), z.number().int().nonnegative()),
          }),
        ),
      }),
    ),
});

const bins = base.prefix("/bins").router({
  list: proc("production.read", { auth: "floor" })
    .route({ method: "GET", path: "/" })
    .input(
      z.object({
        locationId: Id.optional(),
        onlyOccupied: z.boolean().default(false),
        includeArchived: z.boolean().default(false),
      }),
    )
    .output(z.object({ items: z.array(Bin) })),
  create: proc("production.build")
    .route({ method: "POST", path: "/" })
    .input(
      z.object({
        code: z.string().min(1).max(40),
        name: z.string().min(1).max(80).nullable().default(null),
        locationId: Id.optional(),
      }),
    )
    .output(Bin)
    .errors({ CODE_TAKEN: { status: 409, message: "A bin with this code already exists" } }),
  rename: proc("production.build")
    .route({ method: "PATCH", path: "/{id}" })
    .input(z.object({ id: Id, name: z.string().min(1).max(80) }))
    .output(Bin),
  archive: proc("production.build")
    .route({ method: "POST", path: "/{id}/archive" })
    .input(z.object({ id: Id }))
    .output(Bin)
    .errors({ BIN_OCCUPIED: { status: 409, message: "Bin holds an order" } }),
  /** A 4x6 or 2x1 PDF of `BIN:` QR labels, merged, for the chosen bins. */
  labels: proc("production.build")
    .route({ method: "POST", path: "/labels" })
    .input(z.object({ binIds: z.array(Id).min(1).max(200) }))
    .output(z.object({ key: z.string() })),
  /** Put an order in a tote/bin. Scanning a bin code at pick does the same. */
  assign: proc("production.scan", { auth: "floor" })
    .route({ method: "POST", path: "/{code}/assign" })
    .input(z.object({ code: z.string().min(1), orderId: Id }))
    .output(Bin)
    .errors({
      BIN_OCCUPIED: {
        status: 409,
        message: "Bin holds another order",
        data: z.object({ orderNo: z.string() }),
      },
    }),
  release: proc("production.scan", { auth: "floor" })
    .route({ method: "POST", path: "/{code}/release" })
    .input(z.object({ code: z.string().min(1) }))
    .output(Bin),
});

export const production = base
  .prefix("/production")
  .tag("production")
  .router({
    batches,
    jobs,
    sheets,
    reprints,
    bins,
    /** What's next at a station, ordered by rush then ship-by. Pick shows `transfer_in`, press `transfer_in`
     * with a picked blank, QC `pressed`, pack `pressed` (QC passed) grouped by order. */
    queue: proc("production.read", { auth: "floor" })
      .route({ method: "GET", path: "/queue" })
      .input(
        Page.extend({
          station: z.enum(STATIONS),
          stationId: Id.optional(),
          orderId: Id.optional(),
        }),
      )
      .output(StationQueue),
    /**
     * The scan check. Never throws for a mismatch: `ok: false` with a `mismatch` reason is a
     * normal result the tablet shows in red. Idempotent on clientScanId. Stale scans (a later
     * scan already moved the item) return `stale_scan`.
     */
    scan: proc("production.scan", { auth: "floor" })
      .route({ method: "POST", path: "/scans" })
      .input(ScanInput)
      .output(ScanResult),
    /** QC pass -> packed; fail -> ready with a reprint requested and the reason recorded. */
    qc: proc("production.qc", { auth: "floor" })
      .route({ method: "POST", path: "/qc" })
      .input(QcInput)
      .output(z.object({ item: OrderItem, reprint: Reprint.nullable() })),
    /** Marks an order packed once every non-cancelled unit is `packed` (decision 0002). Idempotent
     * on `idempotencyKey`: only a call that changed something is stored, and a replay of that key
     * returns the stored result; a refused call (`PACK_INCOMPLETE`, `FORBIDDEN`, `CONFLICT`) isn't
     * stored, so a retry re-evaluates. Refuses with `missing[]` when units are outstanding, unless
     * `override` is set (needs `production.override`; checked in the handler, not the procedure's
     * own permission, so packers keep calling this without it). An override is "hand to lead"
     * (decision 0010): it records the reason and the missing units, releases the tote, and returns
     * `packed: false` with `missing[]` and `override` set — it never changes the order status. The
     * order ships only once every non-cancelled unit is really packed. */
    packOrder: proc("production.scan", { auth: "floor" })
      .route({ method: "POST", path: "/pack-order" })
      .input(PackOrderInput)
      .output(PackOrderResult)
      .errors({
        PACK_INCOMPLETE: {
          status: 409,
          message: "Units are still missing",
          data: z.object({
            missing: z.array(z.object({ orderItemId: Id, state: z.enum(ORDER_ITEM_STATES) })),
          }),
        },
      }),
    /** Output per staff member for a day (owner dashboard, capacity planning). */
    staffOutput: proc("production.read")
      .route({ method: "GET", path: "/staff-output" })
      .input(z.object({ from: Timestamp, to: Timestamp }))
      .output(
        z.object({
          items: z.array(
            z.object({
              userId: Id,
              name: z.string(),
              station: z.enum(STATIONS),
              units: z.number().int().nonnegative(),
              qcFails: z.number().int().nonnegative(),
            }),
          ),
        }),
      ),
  });
