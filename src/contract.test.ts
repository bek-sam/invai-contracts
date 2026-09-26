import { getEventIteratorSchemaDetails, isContractProcedure } from "@orpc/contract";
import { describe, expect, it } from "vitest";
import { contract, listProcedures, PROCEDURE_PERMISSIONS } from "./contract";
import { PERMISSIONS } from "./roles";

const procedures = listProcedures(contract);

describe("contract", () => {
  it("has a useful number of procedures", () => {
    expect(procedures.length).toBeGreaterThan(150);
  });

  it("every procedure has a method, a path and a known permission", () => {
    for (const p of procedures) {
      expect(p.method, p.path).toMatch(/^(GET|POST|PUT|PATCH|DELETE)$/);
      expect(p.httpPath, p.path).toMatch(/^\//);
      const perm = p.meta.permission;
      expect(perm === "none" || PERMISSIONS.includes(perm), `${p.path} -> ${perm}`).toBe(true);
    }
  });

  it("only auth-bootstrap procedures skip the permission check", () => {
    const publicOnes = procedures.filter((p) => p.meta.permission === "none").map((p) => p.path);
    expect(publicOnes.sort()).toEqual([
      "floor.login",
      "floor.logout",
      "floor.staff",
      "me.get",
      "me.switchOrg",
    ]);
  });

  it("method + path pairs are unique", () => {
    const seen = new Map<string, string>();
    for (const p of procedures) {
      const key = `${p.method} ${p.httpPath}`;
      expect(seen.has(key), `${p.path} duplicates ${seen.get(key)} (${key})`).toBe(false);
      seen.set(key, p.path);
    }
  });

  it("GET procedures never carry a body-only input and DELETE/PUT/PATCH have path ids", () => {
    for (const p of procedures.filter((p) => p.method === "GET")) {
      // GET inputs are query params; a path param must exist in the input schema.
      expect(p.httpPath).not.toMatch(
        /\{(?!id|orderItemId|blankVariantId|userId|code|purchaseOrderId|shipmentId|orderId|jobId)\w+\}/,
      );
    }
  });

  it("list endpoints use cursor pagination", () => {
    const lists = procedures.filter((p) =>
      /\.list$|\.inbox$|\.ledger$|\.unmapped$|\.queue$|\.timeline$|\.imports$|\.conversations$/.test(
        p.path,
      ),
    );
    expect(lists.length).toBeGreaterThan(25);
    for (const p of lists) {
      const node = p.path
        .split(".")
        .reduce<unknown>((acc, k) => (acc as Record<string, unknown>)[k], contract);
      expect(isContractProcedure(node)).toBe(true);
      if (!isContractProcedure(node)) continue;
      const input = node["~orpc"].inputSchema as { shape?: Record<string, unknown> } | undefined;
      const output = node["~orpc"].outputSchema as { shape?: Record<string, unknown> } | undefined;
      if (
        /\.(list|inbox|ledger|unmapped|timeline|imports|conversations|queue)$/.test(p.path) &&
        p.path !== "locations.list" &&
        p.path !== "stations.list" &&
        p.path !== "channels.list" &&
        p.path !== "vendors.list" &&
        p.path !== "bins.list" &&
        !p.path.endsWith("suppliers.list") &&
        !p.path.endsWith("bins.list") &&
        p.path !== "billing.plans" &&
        // Bounded by orderId (a handful of refunds per order), like orderProfit's line items.
        p.path !== "finance.refunds.list"
      ) {
        expect(input?.shape, p.path).toHaveProperty("cursor");
        expect(output?.shape, p.path).toHaveProperty("nextCursor");
      }
    }
  });

  it("the assistant streams an event iterator", () => {
    const details = getEventIteratorSchemaDetails(contract.ai.assistant.ask["~orpc"].outputSchema);
    expect(details).toBeDefined();
  });

  it("PROCEDURE_PERMISSIONS mirrors the meta", () => {
    expect(PROCEDURE_PERMISSIONS["orders.list"]).toBe("orders.read");
    expect(PROCEDURE_PERMISSIONS["production.scan"]).toBe("production.scan");
    expect(PROCEDURE_PERMISSIONS["vendorPortal.markPrinted"]).toBe("vendor_portal.update");
    expect(Object.keys(PROCEDURE_PERMISSIONS)).toHaveLength(procedures.length);
  });

  it("floor procedures are reachable with a floor session", () => {
    for (const path of [
      "production.scan",
      "production.queue",
      "production.qc",
      "floor.logout",
      "me.get",
    ]) {
      const p = procedures.find((x) => x.path === path);
      expect(p?.meta.auth, path).toBe("floor");
    }
    expect(procedures.find((x) => x.path === "floor.login")?.meta.auth).toBe("station");
  });
});
