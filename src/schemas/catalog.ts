import { z } from "zod";
import { CHANNELS } from "../states";
import { Cents, Id, Inches, Ratio, Timestamp } from "./common";

export const PLACEMENTS = ["front", "back", "left_chest", "sleeve_left", "sleeve_right"] as const;
export const Placement = z.enum(PLACEMENTS);
export type Placement = z.infer<typeof Placement>;

export const QA_STATUSES = ["pending", "passed", "warn", "failed"] as const;
export const QaStatus = z.enum(QA_STATUSES);

/**
 * Print-file QA issue codes (mirrors imaging POST /qa/check). The last four were appended in
 * 0.17.0 (B-380); append only, a stored code must stay readable.
 */
export const QA_ISSUE_CODES = [
  "low_dpi",
  "soft_alpha",
  "no_alpha",
  "tiny_file",
  "unreadable",
  "thin_line",
  "small_text",
  "white_box",
  "non_srgb",
] as const;
export const QaIssueCode = z.enum(QA_ISSUE_CODES);
export type QaIssueCode = z.infer<typeof QaIssueCode>;

/** A spot on the art, as ratios 0..1 of the file's width and height (top-left origin). */
export const QaRegion = z.object({
  left: Ratio,
  top: Ratio,
  width: Ratio,
  height: Ratio,
});
export type QaRegion = z.infer<typeof QaRegion>;

/**
 * One issue per code per placement; (placement, code) is the accept key. New fields are optional
 * so cached clients and rows stored before 0.17.0 still parse.
 */
export const QaIssue = z.object({
  code: QaIssueCode,
  severity: z.enum(["error", "warn"]),
  message: z.string(),
  /** Measured value in inches, unrounded (thin_line: thinnest stroke; small_text: tallest small mark). */
  measuredIn: Inches.optional(),
  /** Where it is on the art, at most 20 spots, for the overlay. */
  regions: z.array(QaRegion).max(20).optional(),
  /** Set when a person accepted this warning; kept while the file stays the same. */
  acceptedAt: Timestamp.optional(),
  /** Display name stored at accept time, so it still reads after a rename or removal. */
  acceptedBy: z.string().min(1).max(200).optional(),
});
export type QaIssue = z.infer<typeof QaIssue>;

/** Input of accept/unaccept: which issue on which placement. */
export const QaWarningInput = z.object({ id: Id, placement: Placement, code: QaIssueCode });
export type QaWarningInput = z.infer<typeof QaWarningInput>;

export const DesignPlacement = z.object({
  placement: Placement,
  fileKey: z.string(),
  previewKey: z.string().nullable(),
  widthIn: Inches,
  heightIn: Inches,
  qa: z.object({
    status: QaStatus,
    effectiveDpi: z.number().nullable(),
    issues: z.array(QaIssue),
    checkedAt: Timestamp.nullable(),
  }),
});
export type DesignPlacement = z.infer<typeof DesignPlacement>;

export const DesignPlacementInput = z.object({
  placement: Placement,
  fileKey: z.string().min(1),
  widthIn: Inches,
  heightIn: Inches,
});

/**
 * What the shop says about AI use in a design's artwork (B-274, spec listing-ai-disclosure,
 * architect ruling A3). `unknown` (nobody answered; the default for existing and new designs)
 * and `ai` keep the AI-use notice on listing drafts; `none` drops it. `none` is the shop's own
 * statement: InvAI never sets it and does not verify it. New values go at the end.
 */
export const DESIGN_AI_USES = ["unknown", "none", "ai"] as const;
export const DesignAiUse = z.enum(DESIGN_AI_USES);
export type DesignAiUse = z.infer<typeof DesignAiUse>;

export const Design = z.object({
  id: Id,
  /** Short code used in SKUs (e.g. D1042); unique per org. */
  code: z.string(),
  name: z.string(),
  status: z.enum(["active", "archived"]),
  tags: z.array(z.string()),
  placements: z.array(DesignPlacement),
  personalizationTemplateId: Id.nullable(),
  /** Worst placement QA status. */
  qaStatus: QaStatus,
  /** Text found in the artwork by OCR, used by the trademark check. */
  ocrText: z.string().nullable(),
  ordersLast30d: z.number().int().nonnegative(),
  /** AI use as stated by the shop; always present (`unknown` until someone answers). */
  aiUse: DesignAiUse,
  createdAt: Timestamp,
  updatedAt: Timestamp,
});
export type Design = z.infer<typeof Design>;

export const DesignInput = z.object({
  code: z.string().min(1).max(32),
  name: z.string().min(1),
  tags: z.array(z.string()).default([]),
  placements: z.array(DesignPlacementInput).min(1),
  personalizationTemplateId: Id.nullable().default(null),
  /**
   * Optional with no `.default` on purpose: zod 4 `.partial()` keeps defaults, so a default here
   * would fill every update. Absent on create means the backend stores `unknown`.
   */
  aiUse: DesignAiUse.optional(),
});
export type DesignInput = z.infer<typeof DesignInput>;

/**
 * Input of `designs.update` (PATCH): every field optional and **no defaults**, so an absent field
 * keeps the stored value. `DesignInput.partial()` was used before, but zod 4 `.partial()` keeps
 * `.default()`s, so a PATCH without `tags` or `personalizationTemplateId` parsed to `[]`/`null` and
 * cleared them (latent until a client sends a partial body, as the AI-use control does, B-274).
 * Same accepted shapes as before; only the parsed value of absent keys changes.
 */
export const DesignUpdateInput = z.object({
  id: Id,
  code: z.string().min(1).max(32).optional(),
  name: z.string().min(1).optional(),
  tags: z.array(z.string()).optional(),
  placements: z.array(DesignPlacementInput).min(1).optional(),
  personalizationTemplateId: Id.nullable().optional(),
  aiUse: DesignAiUse.optional(),
});
export type DesignUpdateInput = z.infer<typeof DesignUpdateInput>;

export const SUPPLIERS = ["ssactivewear", "sanmar", "other"] as const;
export const Supplier = z.enum(SUPPLIERS);
export type Supplier = z.infer<typeof Supplier>;

export const BlankVariant = z.object({
  id: Id,
  brand: z.string(), // Gildan
  style: z.string(), // 64000
  /** Code used in SKUs, e.g. G64000 or BC3001. */
  styleCode: z.string(),
  styleName: z.string().nullable(), // Softstyle T-Shirt
  color: z.string(), // Black
  colorCode: z.string(), // BLK
  colorHex: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable(),
  size: z.string(), // M
  sizeCode: z.string(), // M
  supplier: Supplier,
  supplierSku: z.string(),
  cost: Cents,
  weightOz: z.number().positive(),
  status: z.enum(["active", "archived"]),
  createdAt: Timestamp,
  updatedAt: Timestamp,
});
export type BlankVariant = z.infer<typeof BlankVariant>;

export const BlankVariantInput = z.object({
  brand: z.string().min(1),
  style: z.string().min(1),
  styleCode: z.string().min(1),
  styleName: z.string().nullable().default(null),
  color: z.string().min(1),
  colorCode: z.string().min(1),
  colorHex: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable()
    .default(null),
  size: z.string().min(1),
  sizeCode: z.string().min(1),
  supplier: Supplier,
  supplierSku: z.string().min(1),
  cost: Cents.nonnegative(),
  weightOz: z.number().positive(),
});

export const BlankImportReport = z.object({
  created: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  errors: z.array(z.object({ row: z.number().int().positive(), message: z.string() })),
});

/** A design on a blank style. Stock lives on blank variants, never on products. */
export const Product = z.object({
  id: Id,
  designId: Id,
  designName: z.string(),
  brand: z.string(),
  styleCode: z.string(),
  name: z.string(),
  allowedColorCodes: z.array(z.string()),
  allowedSizeCodes: z.array(z.string()),
  defaultPlacements: z.array(Placement),
  prices: z.array(z.object({ channel: z.enum(CHANNELS), price: Cents })),
  status: z.enum(["active", "archived"]),
  createdAt: Timestamp,
  updatedAt: Timestamp,
});
export type Product = z.infer<typeof Product>;

export const ProductInput = z.object({
  designId: Id,
  brand: z.string().min(1),
  styleCode: z.string().min(1),
  name: z.string().min(1),
  allowedColorCodes: z.array(z.string()).min(1),
  allowedSizeCodes: z.array(z.string()).min(1),
  defaultPlacements: z.array(Placement).min(1),
  prices: z.array(z.object({ channel: z.enum(CHANNELS), price: Cents.nonnegative() })).default([]),
});
