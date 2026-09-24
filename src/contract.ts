import { oc } from "@orpc/contract";
import { z } from "zod";
import { Page } from "./schemas/common";
import { NormalizedOrder } from "./schemas/orders";
import { GangSheet, ScanInput, ScanResult } from "./schemas/production";

/**
 * The InvAI API contract. invai-backend implements it with `implement(contract)`;
 * the frontends get a typed client from it. `.route()` metadata becomes REST paths
 * when the public OpenAPI handler is turned on.
 */
export const contract = {
  orders: {
    list: oc
      .route({ method: "GET", path: "/orders" })
      .input(Page.extend({ state: z.string().optional() }))
      .output(z.object({ items: z.array(NormalizedOrder), nextCursor: z.string().nullable() })),
  },
  production: {
    buildSheets: oc
      .route({ method: "POST", path: "/gang-sheets" })
      .input(z.object({ dueBefore: z.iso.datetime() }))
      .output(z.object({ sheets: z.array(GangSheet) })),
    scan: oc.route({ method: "POST", path: "/scans" }).input(ScanInput).output(ScanResult),
  },
};

export type Contract = typeof contract;
