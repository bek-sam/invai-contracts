import { describe, expect, it } from "vitest";
import { CONTRACT_VERSION, FLOOR_COMPAT_BASELINE, isContractVersionAtLeast } from "./compat";
import { contract, listProcedures } from "./contract";
import { Events } from "./events";
import { parseRealtimeEvent, RealtimeEvents } from "./realtime";
import { hasPermission, PERMISSIONS } from "./roles";
import { CREDIT_KINDS, ListingDraft } from "./schemas/ai";
import {
  AnalyzeDesignInput,
  BlankColor,
  canTransitionPhotoImage,
  DesignPhotoAnalysis,
  DesignPhotoAnalysisResult,
  MAX_PHOTO_COMPOSITIONS,
  PHOTO_CHANNELS,
  PHOTO_CHECK_CODES,
  PHOTO_IMAGE_STATUSES,
  PHOTO_VIEWS,
  PhotoEstimate,
  PhotoImage,
  PhotoSet,
  PhotoSetCreateInput,
  PhotoSetSpec,
  PushToShopifyInput,
  presetFor,
  ReviewImagesInput,
} from "./schemas/photos";
import { CHANNELS } from "./states";

const id = "5f1c6c2a-0d5b-4a1e-9b8e-3a2f1c4d5e6f";
const id2 = "6a2d7d3b-1e6c-4b2f-8c9f-4b3a2d5e6f70";
const at = "2026-10-02T14:00:00.000Z";

const black = { name: "Black", hex: "#111111" };
const sand = { name: "Sand", hex: "#E8D9B5" };

const spec = {
  designId: id,
  garments: ["tee", "hoodie"],
  colors: [black, sand],
  views: ["front_flat", "back"],
  channels: ["amazon", "etsy"],
};

const checks = {
  passes: false,
  failures: [{ code: "fill_below_min", severity: "error", detail: "fills 78%" }],
  backgroundPureWhite: true,
  fillRatio: 0.78,
  longestSidePx: 2048,
  regionUnchangedScore: null,
};

const image = {
  id,
  setId: id2,
  compositionId: id,
  channel: "amazon",
  preset: "amazon_main",
  slot: 0,
  garment: "tee",
  view: "front_flat",
  color: black,
  placement: "front",
  source: "template",
  status: "rendered",
  key: `designs/${id}/photos/${id2}/amazon/0.jpg`,
  url: "https://s3.local/signed",
  widthPx: 2048,
  heightPx: 2048,
  format: "jpeg",
  checks,
  designLockScore: null,
  aiGenerated: false,
  containsSyntheticPerson: false,
  drawnTemplate: true,
  altText: "Black tee with a desert bloom print, front view",
  creditsCharged: 1,
  model: null,
  error: null,
  reviewedBy: null,
  reviewedAt: null,
  createdAt: at,
  updatedAt: at,
};

const set = {
  id: id2,
  designId: id,
  designName: "Desert Bloom",
  status: "ready",
  garments: ["tee"],
  colors: [black],
  views: ["front_flat"],
  channels: ["amazon"],
  lifestyle: null,
  counts: { total: 1, queued: 0, rendering: 0, rendered: 1, approved: 0, rejected: 0, failed: 0 },
  creditsEstimated: 1,
  creditsCharged: 1,
  hasAiImages: false,
  hasSyntheticPerson: false,
  zip: {
    status: "none",
    channel: null,
    url: null,
    bytes: null,
    imageCount: 0,
    builtAt: null,
    error: null,
  },
  leadImageUrl: "https://s3.local/signed",
  error: null,
  createdBy: id,
  createdAt: at,
  updatedAt: at,
  compositions: [
    {
      id,
      setId: id2,
      source: "template",
      garment: "tee",
      view: "front_flat",
      color: black,
      placement: "front",
      sceneKind: null,
      creditsCharged: 1,
      chargedAt: at,
    },
  ],
  images: [image],
  pushes: [],
};

const analysis = {
  designId: id,
  source: "mock",
  model: null,
  palette: [
    { hex: "#f2e9d8", share: 0.6 },
    { hex: "#c2410c", share: 0.4 },
  ],
  lightShare: 0.6,
  darkShare: 0.1,
  transparentShare: 0.3,
  style: "Hand-drawn desert botanical",
  audience: "Southwest plant lovers",
  detectedText: "Desert Bloom",
  colorDescription: "Cream and terracotta",
  recommendedColors: [{ ...black, reason: "Light art reads best on a dark blank" }],
  contrastWarnings: [{ blank: sand, ratio: 1.3, kind: "light_on_light" }],
  sceneSuggestions: [
    { kind: "outdoor", description: "Desert trail at golden hour", containsPerson: true },
  ],
  altText: { amazon: "Black tee with a cream desert bloom print", etsy: "Desert bloom tee" },
  imageOrder: { amazon: ["front_flat", "on_model_white", "back"] },
  creditsUsed: 2,
  analyzedAt: at,
};

const photoProcs = listProcedures(contract).filter((p) => p.path.startsWith("photos."));

describe("photos contract (wave 26/27)", () => {
  it("exposes every promised procedure with its method, path and permission", () => {
    const byPath = Object.fromEntries(
      photoProcs.map((p) => [p.path, [p.method, p.httpPath, p.meta.permission]]),
    );
    expect(byPath).toEqual({
      "photos.analyzeDesign": ["POST", "/photos/analyze", "photos.manage"],
      "photos.estimate": ["POST", "/photos/estimate", "photos.read"],
      "photos.createSet": ["POST", "/photos/sets", "photos.manage"],
      "photos.listSets": ["GET", "/photos/sets", "photos.read"],
      "photos.getSet": ["GET", "/photos/sets/{id}", "photos.read"],
      "photos.reviewImages": ["POST", "/photos/sets/{setId}/review", "photos.manage"],
      "photos.exportZip": ["POST", "/photos/sets/{setId}/zip", "photos.manage"],
      "photos.attachToDraft": ["POST", "/photos/sets/{setId}/attach", "photos.manage"],
      "photos.pushTargets": ["GET", "/photos/push-targets", "photos.read"],
      "photos.pushToShopify": ["POST", "/photos/sets/{setId}/push", "photos.manage"],
    });
    // Web sessions only: never floor or station.
    for (const p of photoProcs) expect(p.meta.auth ?? "user", p.path).toBe("user");
  });

  it("every procedure carries the typed errors the cards name", () => {
    const errorsOf = (name: string) =>
      Object.keys(
        (
          (contract.photos as unknown as Record<string, { "~orpc": { errorMap: object } }>)[
            name
          ] as {
            "~orpc": { errorMap: object };
          }
        )["~orpc"].errorMap,
      );
    for (const name of Object.keys(contract.photos)) {
      const codes = errorsOf(name);
      expect(codes, name).toContain("NOT_FOUND");
      expect(codes, name).toContain("CONFLICT");
      expect(codes, name).toContain("FORBIDDEN");
    }
    expect(errorsOf("createSet")).toEqual(
      expect.arrayContaining([
        "CREDITS_EXHAUSTED",
        "AI_SPEND_CAP_REACHED",
        "IMAGE_DAILY_CAP_REACHED",
        "BAD_REQUEST",
      ]),
    );
    expect(errorsOf("analyzeDesign")).toEqual(
      expect.arrayContaining(["CREDITS_EXHAUSTED", "AI_SPEND_CAP_REACHED", "BAD_REQUEST"]),
    );
    for (const name of ["estimate", "reviewImages", "exportZip", "attachToDraft", "pushToShopify"])
      expect(errorsOf(name), name).toContain("BAD_REQUEST");
  });

  it("permissions: owner, admin, office and designer; never floor roles or vendors", () => {
    expect(PERMISSIONS.slice(-2)).toEqual(["photos.read", "photos.manage"]);
    for (const perm of ["photos.read", "photos.manage"] as const) {
      for (const role of ["owner", "admin", "office", "designer"] as const)
        expect(hasPermission(role, perm), `${role} ${perm}`).toBe(true);
      for (const role of ["presser", "packer", "receiver", "vendor"] as const)
        expect(hasPermission(role, perm), `${role} ${perm}`).toBe(false);
    }
  });

  it("enums: PhotoChannel is a subset of CHANNELS; phase B values sit at the end", () => {
    for (const c of PHOTO_CHANNELS) expect(CHANNELS).toContain(c);
    expect(PHOTO_CHANNELS).not.toContain("csv");
    expect(PHOTO_VIEWS.at(-1)).toBe("lifestyle");
    expect(PHOTO_CHECK_CODES.slice(-2)).toEqual(["design_drift", "region_changed"]);
    expect(CREDIT_KINDS.slice(-2)).toEqual(["photo_image", "photo_scene"]);
    expect(presetFor("amazon", 0)).toBe("amazon_main");
    expect(presetFor("amazon", 3)).toBe("amazon_alt");
    expect(presetFor("etsy", 0)).toBe("etsy");
  });

  it("image transitions: a person reviews rendered images; failed never becomes approved", () => {
    expect(canTransitionPhotoImage("queued", "rendering")).toBe(true);
    expect(canTransitionPhotoImage("rendering", "rendered")).toBe(true);
    expect(canTransitionPhotoImage("rendering", "failed")).toBe(true);
    expect(canTransitionPhotoImage("rendered", "approved")).toBe(true);
    expect(canTransitionPhotoImage("rendered", "rejected")).toBe(true);
    expect(canTransitionPhotoImage("approved", "rejected")).toBe(true);
    expect(canTransitionPhotoImage("rejected", "approved")).toBe(true);
    for (const to of PHOTO_IMAGE_STATUSES)
      expect(canTransitionPhotoImage("failed", to)).toBe(false);
    expect(canTransitionPhotoImage("queued", "approved")).toBe(false);
  });

  it("PhotoSetSpec and PhotoSetCreateInput: happy path, defaults and the 48-composition cap", () => {
    const parsed = PhotoSetSpec.parse(spec);
    expect(parsed.underbasePreview).toBe(true);
    expect(parsed.lifestyle).toBeUndefined();
    const created = PhotoSetCreateInput.parse({ ...spec, idempotencyKey: "web-1a2b3c4d" });
    expect(created.idempotencyKey).toBe("web-1a2b3c4d");
    expect(PhotoSetCreateInput.safeParse({ ...spec, idempotencyKey: "short" }).success).toBe(false);
    // 4 garments x 4 views x 4 colors = 64 > 48
    const tooMany = {
      ...spec,
      garments: ["tee", "hoodie", "crewneck", "tank"],
      views: ["front_flat", "folded", "back", "on_model_white"],
      colors: [black, sand, { name: "Navy", hex: "#1f2a44" }, { name: "White", hex: "#ffffff" }],
    };
    expect(tooMany.garments.length * tooMany.views.length * tooMany.colors.length).toBeGreaterThan(
      MAX_PHOTO_COMPOSITIONS,
    );
    expect(PhotoSetSpec.safeParse(tooMany).success).toBe(false);
    expect(
      PhotoSetSpec.safeParse({ ...tooMany, colors: [black, sand, tooMany.colors[2]] }).success,
    ).toBe(true);
    // Lifestyle is phase B: a count within the per-set limit, kinds optional.
    expect(PhotoSetSpec.safeParse({ ...spec, lifestyle: { count: 2 } }).success).toBe(true);
    expect(PhotoSetSpec.safeParse({ ...spec, lifestyle: { count: 9 } }).success).toBe(false);
  });

  it("rejects a bad hex, an unknown garment, empty garments and lifestyle as a template view", () => {
    expect(BlankColor.safeParse({ name: "Black", hex: "#111" }).success).toBe(false);
    expect(BlankColor.safeParse({ name: "Black", hex: "111111" }).success).toBe(false);
    expect(BlankColor.safeParse({ name: "Black", hex: "#11111g" }).success).toBe(false);
    expect(BlankColor.safeParse({ name: "Black", hex: "#ABCDEF" }).success).toBe(true);
    expect(PhotoSetSpec.safeParse({ ...spec, garments: ["polo"] }).success).toBe(false);
    expect(PhotoSetSpec.safeParse({ ...spec, garments: [] }).success).toBe(false);
    expect(PhotoSetSpec.safeParse({ ...spec, views: ["lifestyle"] }).success).toBe(false);
    expect(PhotoSetSpec.safeParse({ ...spec, channels: ["csv"] }).success).toBe(false);
    expect(
      PhotoSetSpec.safeParse({ ...spec, colors: [{ name: "", hex: "#111111" }] }).success,
    ).toBe(false);
  });

  it("PhotoSet, PhotoImage, PhotoEstimate and the analysis round-trip", () => {
    expect(PhotoSet.parse(set)).toEqual(set);
    expect(PhotoImage.parse(image)).toEqual(image);
    expect(DesignPhotoAnalysis.parse(analysis)).toEqual(analysis);
    expect(DesignPhotoAnalysisResult.parse({ status: "ready", analysis })).toMatchObject({
      status: "ready",
    });
    expect(DesignPhotoAnalysisResult.parse({ status: "pending", jobId: id })).toEqual({
      status: "pending",
      jobId: id,
    });
    expect(DesignPhotoAnalysisResult.safeParse({ status: "pending" }).success).toBe(false);
    expect(AnalyzeDesignInput.parse({ designId: id }).refresh).toBe(false);
    const estimate = {
      compositions: 3,
      images: 6,
      credits: 3,
      creditsRemaining: 10,
      canAfford: true,
      skipped: [{ garment: "tank", view: "back", reason: "no_back_print_file" }],
    };
    expect(PhotoEstimate.parse(estimate)).toEqual(estimate);
    // Shares and scores are ratios, never percents.
    expect(PhotoImage.safeParse({ ...image, checks: { ...checks, fillRatio: 78 } }).success).toBe(
      false,
    );
    expect(PhotoImage.safeParse({ ...image, designLockScore: 1.2 }).success).toBe(false);
    // An AI scene image (phase B) parses with the same shape.
    expect(
      PhotoImage.safeParse({
        ...image,
        source: "ai_scene",
        view: "lifestyle",
        aiGenerated: true,
        containsSyntheticPerson: true,
        drawnTemplate: false,
        designLockScore: 0.97,
        model: "mock-image",
        creditsCharged: 10,
      }).success,
    ).toBe(true);
    // altText per channel is partial and bounded.
    expect(DesignPhotoAnalysis.safeParse({ ...analysis, altText: { ebay: "x" } }).success).toBe(
      false,
    );
    expect(
      DesignPhotoAnalysis.safeParse({ ...analysis, altText: { etsy: "x".repeat(251) } }).success,
    ).toBe(false);
  });

  it("review, push and the listing draft disclosures", () => {
    expect(ReviewImagesInput.parse({ setId: id, approve: [id2] })).toEqual({
      setId: id,
      approve: [id2],
      reject: [],
    });
    expect(ReviewImagesInput.safeParse({ setId: id }).success).toBe(false);
    expect(ReviewImagesInput.safeParse({ setId: id, approve: [id2], reject: [id2] }).success).toBe(
      false,
    );
    expect(
      PushToShopifyInput.safeParse({
        setId: id,
        connectionId: id2,
        productRef: { listingId: id },
        imageIds: [id2],
        idempotencyKey: "push-1a2b3c4d",
      }).success,
    ).toBe(true);
    expect(
      PushToShopifyInput.safeParse({
        setId: id,
        connectionId: id2,
        productRef: { listingId: id },
        imageIds: Array.from({ length: 21 }, () => id2),
        idempotencyKey: "push-1a2b3c4d",
      }).success,
    ).toBe(false);
    // Older drafts without imageDisclosures still parse; new ones carry both flags.
    const draft = {
      id,
      designId: id2,
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
      createdAt: at,
      updatedAt: at,
    };
    const parsed = ListingDraft.safeParse(draft);
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
    expect(
      ListingDraft.parse({
        ...draft,
        imageDisclosures: { aiGenerated: true, syntheticPerformer: false },
      }).imageDisclosures,
    ).toEqual({ aiGenerated: true, syntheticPerformer: false });
  });

  it("events: outbox photo_set.created/completed and realtime photo_set.updated", () => {
    expect(
      Events["photo_set.created"].parse({ setId: id, designId: id2, compositionIds: [id] }),
    ).toBeTruthy();
    expect(
      Events["photo_set.completed"].safeParse({ setId: id, status: "rendering" }).success,
    ).toBe(false);
    expect(Object.keys(RealtimeEvents).at(-1)).toBe("photo_set.updated");
    expect(
      parseRealtimeEvent("photo_set.updated", {
        setId: id,
        designId: id2,
        status: "rendering",
        rendered: 3,
        failed: 0,
        total: 8,
      }),
    ).toMatchObject({ rendered: 3 });
  });

  it("version is at least 0.12.0 (additive, minor bump on 0.x); floor baseline untouched (ADR 0012)", () => {
    expect(isContractVersionAtLeast(CONTRACT_VERSION, "0.12.0")).toBe(true);
    expect(FLOOR_COMPAT_BASELINE).toBe("0.3.0");
  });
});
