import { z } from "zod";
import { DateOnly, Id, JobRef, Ok, Page, Period, paginated } from "../schemas/common";
import {
  AdSpend,
  AdSpendInput,
  CostSettings,
  CostSettingsInput,
  OrderProfit,
  ProfitDimension,
  ProfitSummary,
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

export const finance = base
  .prefix("/finance")
  .tag("finance")
  .router({
    costSettings,
    adSpend,
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
