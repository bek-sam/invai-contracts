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
    /**
     * Stripe is stubbed in v1: with no key (or `ALLOW_MOCKS`) the plan changes immediately and
     * `checkoutUrl` is null. With live Stripe this only allows a downgrade to free or a
     * cancel-at-period-end; any paid plan throws `PAYMENT_REQUIRED` with the checkout URL to use
     * instead (wave 2, `billing.checkout`).
     */
    changePlan: proc("billing.manage")
      .route({ method: "POST", path: "/plan" })
      .input(z.object({ plan: PlanKey }))
      .output(z.object({ checkoutUrl: z.url().nullable(), status: BillingStatus })),
    /**
     * Starts a Stripe Checkout session: a subscription for `plan`, or a one-time payment for an
     * AI credit `pack`. Never changes the plan or credit balance directly — only the `/webhooks/
     * stripe` handler does that, once Stripe confirms the payment (wave 2).
     */
    checkout: proc("billing.manage")
      .route({ method: "POST", path: "/checkout" })
      .input(z.union([z.object({ plan: PlanKey }), z.object({ pack: z.string() })]))
      .output(z.object({ url: z.url() })),
    /** Opens the Stripe customer portal (manage payment method, invoices, cancel) (wave 2). */
    portal: proc("billing.manage")
      .route({ method: "POST", path: "/portal" })
      .input(z.object({}))
      .output(z.object({ url: z.url() })),
  });
