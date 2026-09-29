import { z } from "zod";
import { DateOnly, Id, Page, paginated, Timestamp } from "../schemas/common";
import {
  AddressVerification,
  BATCH_STRATEGIES,
  BatchBuyResult,
  RatesInput,
  RatesResult,
  SCAN_FORM_CARRIERS,
  ScanForm,
  ScanFormCreateInput,
  Shipment,
  ShippingSettings,
  ShippingSettingsInput,
  ShipQueueEntry,
  TRACKING_PUSH_STATUSES,
  TrackingPushStatus,
} from "../schemas/shipping";
import { CHANNELS, SHIPMENT_STATES } from "../states";
import { base, proc } from "./_base";

const shipments = base.prefix("/shipments").router({
  list: proc("shipping.read")
    .route({ method: "GET", path: "/" })
    .input(
      Page.extend({
        status: z.array(z.enum(SHIPMENT_STATES)).optional(),
        channel: z.enum(CHANNELS).optional(),
        orderId: Id.optional(),
        search: z.string().optional(),
        from: Timestamp.optional(),
        to: Timestamp.optional(),
      }),
    )
    .output(paginated(Shipment)),
  get: proc("shipping.read", { auth: "floor" })
    .route({ method: "GET", path: "/{id}" })
    .input(z.object({ id: Id }))
    .output(Shipment),
});

const settings = base.prefix("/settings").router({
  get: proc("shipping.read")
    .route({ method: "GET", path: "/" })
    .input(z.object({}))
    .output(ShippingSettings),
  update: proc("shipping.manage")
    .route({ method: "PATCH", path: "/" })
    .input(ShippingSettingsInput)
    .output(ShippingSettings),
});

const trackingPush = base.prefix("/tracking-push").router({
  list: proc("shipping.read")
    .route({ method: "GET", path: "/" })
    .input(
      Page.extend({
        status: z.array(z.enum(TRACKING_PUSH_STATUSES)).default(["failed", "pending"]),
      }),
    )
    .output(paginated(TrackingPushStatus)),
  retry: proc("shipping.buy")
    .route({ method: "POST", path: "/{shipmentId}/retry" })
    .input(z.object({ shipmentId: Id }))
    .output(TrackingPushStatus),
});

/**
 * USPS end-of-day SCAN forms (B-25, T-22-3, implementer: integrations-engineer by grant into
 * the shipping module). `create` is `shipping.manage` (owner, admin, office): manifesting the
 * day's pickup is an office action, and packers (who hold `shipping.buy`) must be refused.
 */
const scanForms = base.prefix("/scan-forms").router({
  /**
   * Manifest every label bought for `carrier` on `date` that isn't on a form yet. Idempotent on
   * (carrier, date): a second call returns the existing form unchanged, never a second one.
   */
  create: proc("shipping.manage")
    .route({ method: "POST", path: "/" })
    .input(ScanFormCreateInput)
    .output(ScanForm)
    .errors({
      NO_LABELS_TO_MANIFEST: {
        status: 409,
        message: "No labels for this carrier and day are waiting for a SCAN form",
      },
      SCAN_FORM_REJECTED: {
        status: 502,
        message: "Carrier refused the SCAN form",
        data: z.object({ detail: z.string() }),
      },
    }),
  list: proc("shipping.read")
    .route({ method: "GET", path: "/" })
    .input(
      Page.extend({
        carrier: z.enum(SCAN_FORM_CARRIERS).optional(),
        from: DateOnly.optional(),
        to: DateOnly.optional(),
      }),
    )
    .output(paginated(ScanForm)),
  get: proc("shipping.read")
    .route({ method: "GET", path: "/{id}" })
    .input(z.object({ id: Id }))
    .output(ScanForm),
});

export const shipping = base
  .prefix("/shipping")
  .tag("shipping")
  .router({
    shipments,
    settings,
    trackingPush,
    scanForms,
    /**
     * Carrier address check on an order's ship-to (B-25, T-22-3). `shipping.manage` because the
     * check is a carrier call made from the shipping side and its holders (owner, admin, office)
     * are the people who fix addresses; `failed` puts the order on the `address_check` hold as
     * a side effect. Returns the stored result for a repeat call while the ship-to is unchanged.
     */
    verifyAddress: proc("shipping.manage")
      .route({ method: "POST", path: "/verify-address" })
      .input(z.object({ orderId: Id }))
      .output(AddressVerification)
      .errors({
        NO_SHIP_TO: { status: 409, message: "This order has no ship-to address" },
      }),
    /** Orders fully packed and not yet labeled, in ship-by order. */
    queue: proc("shipping.read", { auth: "floor" })
      .route({ method: "GET", path: "/queue" })
      .input(Page.extend({ channel: z.enum(CHANNELS).optional(), atRisk: z.boolean().optional() }))
      .output(paginated(ShipQueueEntry).extend({ total: z.number().int().nonnegative() })),
    /** Rate-shop a packed order; creates (or reuses) the pending shipment and returns its rates. */
    rates: proc("shipping.buy", { auth: "floor" })
      .route({ method: "POST", path: "/rates" })
      .input(RatesInput)
      .output(RatesResult)
      .errors({
        ORDER_NOT_PACKED: { status: 409, message: "Every unit must be packed first" },
        ADDRESS_INVALID: {
          status: 422,
          message: "Ship-to address is not deliverable",
          data: z.object({ detail: z.string() }),
        },
      }),
    /** Buy the chosen rate. Items move packed -> shipped and tracking push is queued. Idempotent per shipment. */
    buy: proc("shipping.buy", { auth: "floor" })
      .route({ method: "POST", path: "/buy" })
      .input(z.object({ shipmentId: Id, rateId: z.string().min(1) }))
      .output(Shipment)
      .errors({ RATE_EXPIRED: { status: 409, message: "Rates expired; fetch them again" } }),
    /**
     * Rate + buy for many orders with a strategy. Always enqueues a `batch_labels` job (crash-safe,
     * one `buy` per order) and returns immediately with `status: "queued"`, zero counts and `jobId`.
     * Poll `production.jobs.get({ id: jobId })` for progress, or re-fetch `shipping.queue`.
     */
    batchBuy: proc("shipping.buy")
      .route({ method: "POST", path: "/batch-buy" })
      .input(
        z.object({
          orderIds: z.array(Id).min(1).max(100),
          strategy: z.enum(BATCH_STRATEGIES).optional(),
          packagePresetId: Id.optional(),
        }),
      )
      .output(BatchBuyResult),
    /** One PDF with every 4x6 label, in pack (bin) order, for the browser print dialog. */
    batchLabelPdf: proc("shipping.read", { auth: "floor" })
      .route({ method: "POST", path: "/labels/pdf" })
      .input(
        z.object({
          shipmentIds: z.array(Id).min(1).max(500),
          order: z.enum(["bin", "shipBy", "created"]).default("bin"),
        }),
      )
      .output(
        z.object({
          fileKey: z.string(),
          url: z.url(),
          pages: z.number().int().positive(),
          expiresAt: Timestamp,
        }),
      ),
    /** Void a label (refund via the carrier). Items return packed -> ... only if not yet scanned by the carrier. */
    void: proc("shipping.buy")
      .route({ method: "POST", path: "/shipments/{id}/void" })
      .input(z.object({ id: Id, reason: z.string().max(200).optional() }))
      .output(Shipment)
      .errors({
        VOID_REJECTED: {
          status: 409,
          message: "Carrier refused the void",
          data: z.object({ detail: z.string() }),
        },
      }),
    /**
     * T-7-1: exports tracking for a CSV-only (pendingApproval adapter) channel to one file.
     * Query is `trackingPushStatus = 'manual' AND labeledAt >= (since ?? lastExportedAt)`;
     * re-export re-runs the query and overwrites `exportedAt`.
     */
    exportTracking: proc("shipping.manage")
      .route({ method: "POST", path: "/exports/tracking" })
      .input(
        z.object({
          channel: z.enum(CHANNELS),
          since: Timestamp.nullable(),
          until: Timestamp.optional(),
        }),
      )
      .output(z.object({ key: z.string(), count: z.number().int().nonnegative() }))
      .errors({
        NOT_CSV_CHANNEL: { status: 400, message: "This channel is not CSV-only" },
      }),
  });
