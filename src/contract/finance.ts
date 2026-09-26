import { z } from "zod";
import {
  Cents,
  DateOnly,
  Id,
  JobRef,
  Ok,
  Page,
  Period,
  paginated,
  Timestamp,
} from "../schemas/common";
import {
  AdSpend,
  AdSpendInput,
  CostSettings,
  CostSettingsInput,
  OrderProfit,
  ProfitDimension,
  ProfitSummary,
  RefundEvent,
} from "../schemas/finance";
import { CHANNELS } from "../states";
import { base, proc } from "./_base";

const costSettings = base.prefix("/cost-settings").router({
  get: proc("finance.read")
    .route({ method: "GET", path: "/" })
    .input(z.object({}))
    .output(CostSettings),
  /** Partial update; changing fees or rates triggers a profit recompute job for the last 90 days. */
  update: proc("finance.manage")
    .route({ method: "PATCH", path: "/" })
    .input(CostSettingsInput)
    .output(CostSettings),
});

const adSpend = base.prefix("/ad-spend").router({
  list: proc("finance.read")
    .route({ method: "GET", path: "/" })
    .input(
      Page.extend({
        channel: z.enum(CHANNELS).optional(),
        from: DateOnly.optional(),
        to: DateOnly.optional(),
      }),
    )
    .output(paginated(AdSpend).extend({ total: z.number().int() })),
  create: proc("finance.manage")
    .route({ method: "POST", path: "/" })
    .input(AdSpendInput)
    .output(AdSpend),
  update: proc("finance.manage")
    .route({ method: "PATCH", path: "/{id}" })
    .input(AdSpendInput.partial().extend({ id: Id }))
    .output(AdSpend),
  delete: proc("finance.manage")
    .route({ method: "DELETE", path: "/{id}" })
    .input(z.object({ id: Id }))
    .output(Ok),
  /** Bulk entries from a CSV (date, channel, amount, campaign). */
  importCsv: proc("finance.manage")
    .route({ method: "POST", path: "/import" })
    .input(z.object({ fileKey: z.string().min(1) }))
    .output(
      z.object({
        created: z.number().int().nonnegative(),
        failed: z.number().int().nonnegative(),
        errors: z.array(z.object({ row: z.number().int(), message: z.string() })),
      }),
    ),
});

/**
 * T-7-2: dated refund ledger. `refundedAt` (not the order's `placedAt`) is what `profit`'s
 * period buckets read for the `refunds` cost bucket. Shopify/CSV ingestion upserts by
 * (companyId, channel, channelRefundId); `record` is the manual CSV path (a new row per call
 * is correct -- retries are the UI's job, there is no client-supplied idempotency key).
 */
const refunds = base.prefix("/refunds").router({
  record: proc("finance.manage")
    .route({ method: "POST", path: "/" })
    .input(
      z.object({
        orderId: Id,
        orderItemId: Id.nullable(),
        amountCents: Cents,
        refundedAt: Timestamp,
        note: z.string().max(500).nullable().default(null),
      }),
    )
    .output(RefundEvent)
    .errors({
      INVALID_ORDER_ITEM: { status: 400, message: "Order item does not belong to this order" },
      /** The refund plus the order's earlier refunds would exceed what the order sold for. */
      REFUND_EXCEEDS_ORDER: {
        status: 400,
        message: "The refund is more than what is left to refund on this order",
        data: z.object({ remainingCents: Cents }),
      },
    }),
  /** Void a manual refund entered by mistake: audited, dated, and it stops counting in profit.
   * Channel refunds (Shopify, CSV) can't be voided here; the next sync is their source of truth. */
  void: proc("finance.manage")
    .route({ method: "POST", path: "/{id}/void" })
    .input(z.object({ id: Id, reason: z.string().trim().min(1).max(500) }))
    .output(RefundEvent)
    .errors({
      REFUND_NOT_MANUAL: { status: 400, message: "Only a manually recorded refund can be voided" },
      REFUND_ALREADY_VOIDED: { status: 409, message: "This refund is already voided" },
    }),
  list: proc("finance.read")
    .route({ method: "GET", path: "/" })
    .input(z.object({ orderId: Id }))
    .output(z.object({ items: z.array(RefundEvent) })),
});

export const finance = base
  .prefix("/finance")
  .tag("finance")
  .router({
    costSettings,
    adSpend,
    refunds,
    /** True profit by dimension for a period (from the materialized profit view). */
    profit: proc("finance.read")
      .route({ method: "GET", path: "/profit" })
      .input(
        z.object({
          dimension: ProfitDimension,
          period: Period,
          channel: z.enum(CHANNELS).optional(),
          designId: Id.optional(),
          limit: z.number().int().min(1).max(1000).default(200),
          sort: z.enum(["net", "revenue", "marginPct", "units", "key"]).default("net"),
        }),
      )
      .output(ProfitSummary),
    /** Same filters as `profit`, so the export always matches what's on screen. Returns the
     * file's S3 key. */
    exportCsv: proc("finance.read")
      .route({ method: "POST", path: "/profit/export-csv" })
      .input(
        z.object({
          dimension: ProfitDimension,
          period: Period,
          channel: z.enum(CHANNELS).optional(),
          designId: Id.optional(),
        }),
      )
      .output(z.object({ key: z.string() })),
    /** Every cost line for one order, with which parts are estimates. */
    orderProfit: proc("finance.read")
      .route({ method: "GET", path: "/orders/{orderId}" })
      .input(z.object({ orderId: Id }))
      .output(OrderProfit),
    /** Force a recompute (nightly job does this anyway). */
    recompute: proc("finance.manage")
      .route({ method: "POST", path: "/recompute" })
      .input(z.object({ period: Period.optional() }))
      .output(JobRef),
  });
