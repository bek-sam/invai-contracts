import { z } from "zod";
import { BillingStatus, Plan } from "../schemas/billing";
import { PlanKey } from "../schemas/tenancy";
import { base, proc } from "./_base";

export const billing = base
  .prefix("/billing")
  .tag("billing")
  .router({
    /** Current plan, usage against limits and status. */
    get: proc("billing.read")
      .route({ method: "GET", path: "/" })
      .input(z.object({}))
      .output(BillingStatus),
    plans: proc("billing.read")
      .route({ method: "GET", path: "/plans" })
      .input(z.object({}))
      .output(z.object({ items: z.array(Plan) })),
    /** Stripe is stubbed in v1: with no key the plan changes immediately and `checkoutUrl` is null. */
    changePlan: proc("billing.manage")
      .route({ method: "POST", path: "/plan" })
      .input(z.object({ plan: PlanKey }))
      .output(z.object({ checkoutUrl: z.url().nullable(), status: BillingStatus })),
  });
