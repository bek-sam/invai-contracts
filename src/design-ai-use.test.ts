import { describe, expect, it } from "vitest";
import { CONTRACT_VERSION, FLOOR_COMPAT_BASELINE, isContractVersionAtLeast } from "./compat";
import { contract, PROCEDURE_PERMISSIONS } from "./contract";
import { ListingDraft } from "./schemas/ai";
import {
  DESIGN_AI_USES,
  Design,
  DesignAiUse,
  DesignInput,
  DesignUpdateInput,
} from "./schemas/catalog";

const ID = "7d6f1c1e-6a52-4c0e-9d5a-1d7a3a1b2c3d";
const ID2 = "0b8e2a4f-3c1d-4e5f-8a9b-0c1d2e3f4a5b";
const AT = "2026-10-13T12:00:00.000Z";

const design = {
  id: ID,
  code: "D1042",
  name: "Desert Bloom",
  status: "active",
  tags: ["cactus"],
  placements: [],
  personalizationTemplateId: null,
  qaStatus: "passed",
  ocrText: null,
  ordersLast30d: 0,
  createdAt: AT,
  updatedAt: AT,
} as const;

const draft = {
  id: ID,
  designId: ID2,
  designName: "Desert Bloom",
  channel: "etsy",
  connectionId: null,
  productId: null,
  status: "needs_review",
  content: {
    title: "Desert Bloom tee",
    description: "A tee.",
    tags: [],
    bullets: [],
    attributes: {},
    price: null,
    disclosures: [],
    productionPartner: null,
  },
  validation: null,
  trademark: null,
  trademarkReview: null,
  mockupKeys: [],
  model: null,
  creditsUsed: 0,
  approvedBy: null,
  approvedAt: null,
  rejectedReason: null,
  publishedListingId: null,
  publishedUrl: null,
  error: null,
  createdAt: AT,
  updatedAt: AT,
};

const placement = {
  placement: "front",
  fileKey: `${ID}/design/a.png`,
  widthIn: 10.5,
  heightIn: 12,
};

describe("design AI use (0.18.0, B-274, ruling A3)", () => {
  it("has the three values in order; unknown first", () => {
    expect(DESIGN_AI_USES).toEqual(["unknown", "none", "ai"]);
    for (const v of DESIGN_AI_USES) expect(DesignAiUse.parse(v)).toBe(v);
    expect(DesignAiUse.safeParse("maybe").success).toBe(false);
  });

  it("Design.aiUse is always present", () => {
    expect(Design.safeParse(design).success).toBe(false);
    const d = Design.parse({ ...design, aiUse: "none" });
    expect(d.aiUse).toBe("none");
    expect(Design.safeParse({ ...design, aiUse: "maybe" }).success).toBe(false);
  });

  it("DesignInput.aiUse is optional with no default (create stores unknown server-side)", () => {
    expect("aiUse" in DesignInput.partial().parse({})).toBe(false);
    const c = DesignInput.parse({ code: "D1", name: "N", placements: [placement] });
    expect("aiUse" in c).toBe(false);
    expect(
      DesignInput.parse({ code: "D1", name: "N", placements: [placement], aiUse: "ai" }).aiUse,
    ).toBe("ai");
    expect(
      DesignInput.safeParse({ code: "D1", name: "N", placements: [placement], aiUse: "maybe" })
        .success,
    ).toBe(false);
  });

  it("designs.update input fills nothing: an absent field keeps the stored value", () => {
    const input = contract.designs.update["~orpc"].inputSchema;
    expect(input).toBe(DesignUpdateInput);
    // Only the AI-use control's body: no tags/template/aiUse defaults may appear.
    expect(DesignUpdateInput.parse({ id: ID, aiUse: "none" })).toEqual({ id: ID, aiUse: "none" });
    expect(DesignUpdateInput.parse({ id: ID, name: "New" })).toEqual({ id: ID, name: "New" });
    // Same accepted shapes as before.
    const full = {
      id: ID,
      code: "D1",
      name: "N",
      tags: ["a"],
      placements: [placement],
      personalizationTemplateId: null,
    };
    expect(DesignUpdateInput.parse(full)).toEqual(full);
    expect(DesignUpdateInput.safeParse({ id: ID, placements: [] }).success).toBe(false);
    expect(DesignUpdateInput.safeParse({ id: ID, code: "" }).success).toBe(false);
    expect(DesignUpdateInput.safeParse({ id: ID, aiUse: "maybe" }).success).toBe(false);
    expect(DesignUpdateInput.safeParse({ aiUse: "ai" }).success).toBe(false);
    expect(PROCEDURE_PERMISSIONS["designs.update"]).toBe("catalog.manage");
    expect(contract.designs.update["~orpc"].route).toMatchObject({
      method: "PATCH",
      path: "/designs/{id}",
    });
  });

  it("ListingDraft.designAiUse is optional, so older payloads still parse", () => {
    expect(ListingDraft.safeParse(draft).success).toBe(true);
    expect(ListingDraft.parse({ ...draft, designAiUse: "unknown" }).designAiUse).toBe("unknown");
    expect(ListingDraft.safeParse({ ...draft, designAiUse: "maybe" }).success).toBe(false);
  });

  it("is at least 0.18.0 and leaves the floor baseline alone", () => {
    expect(isContractVersionAtLeast(CONTRACT_VERSION, "0.18.0")).toBe(true);
    expect(isContractVersionAtLeast(FLOOR_COMPAT_BASELINE, "0.18.0")).toBe(false);
  });
});
