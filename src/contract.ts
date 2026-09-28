import { type AnyContractRouter, type HTTPMethod, isContractProcedure } from "@orpc/contract";
import type { ProcedureMeta } from "./contract/_base";
import { ai } from "./contract/ai";
import { alerts } from "./contract/alerts";
import { billing } from "./contract/billing";
import { blanks, designs, products } from "./contract/catalog";
import { channels, skuRules } from "./contract/channels";
import { digest } from "./contract/digest";
import { files } from "./contract/files";
import { finance } from "./contract/finance";
import { inventory } from "./contract/inventory";
import { market } from "./contract/market";
import { orderItems, orders } from "./contract/orders";
import { personalization } from "./contract/personalization";
import { privacy } from "./contract/privacy";
import { production } from "./contract/production";
import { shipping } from "./contract/shipping";
import { audit, demo, floor, locations, me, stations, team } from "./contract/tenancy";
import { today } from "./contract/today";
import { vendorPortal, vendors } from "./contract/vendors";

/**
 * The InvAI v1 API contract. invai-backend implements it with `implement(contract)`;
 * invai-web and invai-floor get a typed client from it. `.route()` metadata becomes REST
 * paths (all under `/api`) when the OpenAPI handler is turned on; the apps use the RPC
 * link at `/rpc`. Every procedure carries `{ permission, auth }` in its meta.
 */
export const contract = {
  // tenancy
  me,
  team,
  locations,
  stations,
  floor,
  audit,
  demo,
  // home
  today,
  alerts,
  // orders
  orders,
  orderItems,
  // channels
  channels,
  skuRules,
  // catalog
  designs,
  blanks,
  products,
  files,
  personalization,
  // production
  production,
  vendors,
  vendorPortal,
  inventory,
  shipping,
  // money and AI
  finance,
  ai,
  // market signals: niche taxonomy, design niches, recommendation feed and votes (wave 18)
  market,
  // weekly business review: digests, insight feedback and clicks, shop settings, preview (wave 19)
  digest,
  billing,
  // whole-company export and deletion (B-23)
  privacy,
};

export type Contract = typeof contract;

export interface ProcedureInfo {
  /** Dotted path, e.g. "orders.list". */
  path: string;
  method: HTTPMethod;
  /** Full REST path including prefixes, e.g. "/orders/{id}/hold". */
  httpPath: string;
  meta: ProcedureMeta;
}

/** Walks a contract router and lists every procedure with its route and meta. */
export function listProcedures(router: AnyContractRouter, prefix: string[] = []): ProcedureInfo[] {
  if (isContractProcedure(router)) {
    const def = router["~orpc"];
    return [
      {
        path: prefix.join("."),
        method: def.route.method ?? "POST",
        httpPath: def.route.path ?? `/${prefix.join("/")}`,
        meta: def.meta as ProcedureMeta,
      },
    ];
  }
  return Object.entries(router).flatMap(([key, child]) =>
    listProcedures(child as AnyContractRouter, [...prefix, key]),
  );
}

/** Required permission per dotted procedure path, derived from each procedure's meta. */
export const PROCEDURE_PERMISSIONS: Readonly<Record<string, ProcedureMeta["permission"]>> =
  Object.fromEntries(listProcedures(contract).map((p) => [p.path, p.meta.permission]));
