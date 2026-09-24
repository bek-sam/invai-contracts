import { z } from "zod";
import { CHANNELS } from "../states";
import { Cents, Id, Inches, Timestamp } from "./common";

export const PLACEMENTS = ["front", "back", "left_chest", "sleeve_left", "sleeve_right"] as const;
export const Placement = z.enum(PLACEMENTS);
export type Placement = z.infer<typeof Placement>;

export const QA_STATUSES = ["pending", "passed", "warn", "failed"] as const;
export const QaStatus = z.enum(QA_STATUSES);

/** Mirrors imaging POST /qa/check issue codes. */
export const QaIssue = z.object({
  code: z.enum(["low_dpi", "soft_alpha", "no_alpha", "tiny_file", "unreadable"]),
  severity: z.enum(["error", "warn"]),
  message: z.string(),
});

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
});

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
