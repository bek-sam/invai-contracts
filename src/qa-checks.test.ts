import { describe, expect, it } from "vitest";
import { CONTRACT_VERSION, FLOOR_COMPAT_BASELINE, isContractVersionAtLeast } from "./compat";
import { contract, listProcedures, PROCEDURE_PERMISSIONS } from "./contract";
import { QA_ISSUE_CODES, QaIssue, QaWarningInput } from "./schemas/catalog";

const base = { severity: "warn", message: "m" } as const;
const ID = "7d6f1c1e-6a52-4c0e-9d5a-1d7a3a1b2c3d";

describe("print-file QA issues (0.17.0, B-380)", () => {
  it("appends the four codes last and parses each", () => {
    expect(QA_ISSUE_CODES.slice(-4)).toEqual(["thin_line", "small_text", "white_box", "non_srgb"]);
    for (const code of QA_ISSUE_CODES)
      expect(QaIssue.safeParse({ ...base, code }).success).toBe(true);
    expect(QaIssue.safeParse({ ...base, code: "blurry" }).success).toBe(false);
  });

  it("still parses an issue stored before the new fields", () => {
    expect(QaIssue.safeParse({ ...base, code: "low_dpi" }).success).toBe(true);
  });

  it("bounds regions, ratios and measuredIn", () => {
    const r = { left: 0, top: 0.5, width: 1, height: 0.1 };
    const ok = (extra: object) =>
      QaIssue.safeParse({ ...base, code: "thin_line", ...extra }).success;
    expect(ok({ regions: Array(20).fill(r), measuredIn: 0.015 })).toBe(true);
    expect(ok({ regions: Array(21).fill(r) })).toBe(false);
    expect(ok({ regions: [{ ...r, left: -0.01 }] })).toBe(false);
    expect(ok({ regions: [{ ...r, width: 1.01 }] })).toBe(false);
    expect(ok({ measuredIn: 0 })).toBe(false);
    expect(ok({ measuredIn: -1 })).toBe(false);
    expect(ok({ acceptedAt: "2026-10-13T00:00:00.000Z", acceptedBy: "Ana" })).toBe(true);
    expect(ok({ acceptedBy: "" })).toBe(false);
  });

  it("accept and unaccept: routes, permission, errors", () => {
    const acc = contract.designs.acceptQaWarning["~orpc"];
    const un = contract.designs.unacceptQaWarning["~orpc"];
    expect(acc.route.method).toBe("POST");
    expect(acc.route.path).toBe("/designs/{id}/qa/accept");
    expect(un.route.path).toBe("/designs/{id}/qa/unaccept");
    expect(PROCEDURE_PERMISSIONS["designs.acceptQaWarning"]).toBe("catalog.manage");
    expect(PROCEDURE_PERMISSIONS["designs.unacceptQaWarning"]).toBe("catalog.manage");
    const auth = (p: string) => listProcedures(contract).find((x) => x.path === p)?.meta.auth;
    expect(auth("designs.acceptQaWarning") ?? "user").toBe("user");
    expect(acc.errorMap.QA_ISSUE_NOT_FOUND?.status).toBe(404);
    expect(acc.errorMap.QA_NOT_WARNING?.status).toBe(409);
    expect(un.errorMap.QA_ISSUE_NOT_FOUND?.status).toBe(404);
    expect(Object.keys(un.errorMap)).not.toContain("QA_NOT_WARNING");
  });

  it("input needs id, placement and a known code", () => {
    expect(
      QaWarningInput.safeParse({ id: ID, placement: "front", code: "thin_line" }).success,
    ).toBe(true);
    expect(QaWarningInput.safeParse({ id: ID, placement: "front", code: "x" }).success).toBe(false);
    expect(QaWarningInput.safeParse({ id: ID, code: "thin_line" }).success).toBe(false);
  });

  it("is at least 0.17.0 and leaves the floor baseline alone", () => {
    expect(isContractVersionAtLeast(CONTRACT_VERSION, "0.17.0")).toBe(true);
    expect(isContractVersionAtLeast(FLOOR_COMPAT_BASELINE, "0.17.0")).toBe(false);
  });
});
