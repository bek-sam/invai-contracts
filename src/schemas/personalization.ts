import { z } from "zod";
import { Id, Inches, Timestamp } from "./common";

/** Fonts installed on the imaging service (v1-plan 5.1a); unknown names fall back to Inter. */
export const TEMPLATE_FONTS = [
  "Inter",
  "Inter Bold",
  "Inter Black",
  "Oswald",
  "Pacifico",
  "Bebas Neue",
] as const;

/** Mirrors imaging POST /render/personalization slots (v1-plan 5.1). Text slots only in v1. */
export const TemplateSlot = z.object({
  name: z.string().min(1).max(40),
  kind: z.literal("text"),
  xIn: z.number().nonnegative(),
  yIn: z.number().nonnegative(),
  wIn: Inches,
  hIn: Inches,
  fontFamily: z.string(),
  fontSizePt: z.number().positive(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  align: z.enum(["left", "center", "right"]),
  maxChars: z.number().int().positive().nullable(),
  uppercase: z.boolean(),
  /** Which buyer question fills this slot (matched case-insensitively against the channel question). */
  sourceQuestion: z.string().nullable(),
  required: z.boolean(),
  placeholder: z.string().nullable(),
});
export type TemplateSlot = z.infer<typeof TemplateSlot>;

export const PersonalizationTemplate = z.object({
  id: Id,
  name: z.string(),
  widthIn: Inches,
  heightIn: Inches,
  backgroundKey: z.string().nullable(),
  dpi: z.number().int().positive(),
  slots: z.array(TemplateSlot),
  designCount: z.number().int().nonnegative(),
  createdAt: Timestamp,
  updatedAt: Timestamp,
});
export type PersonalizationTemplate = z.infer<typeof PersonalizationTemplate>;

export const PersonalizationTemplateInput = z.object({
  name: z.string().min(1),
  widthIn: Inches,
  heightIn: Inches,
  backgroundKey: z.string().nullable().default(null),
  dpi: z.number().int().positive().default(300),
  slots: z.array(TemplateSlot).min(1),
});

/** Mirrors imaging render flags plus the AI personalization check. */
export const ARTWORK_FLAG_CODES = [
  "overflow",
  "empty",
  "too_long",
  "suspicious_chars",
  "possible_typo",
  "odd_date",
  "missing_answer",
] as const;

export const ArtworkFlag = z.object({
  slot: z.string().nullable(),
  code: z.enum(ARTWORK_FLAG_CODES),
  message: z.string(),
  suggestion: z.string().nullable(),
});
export type ArtworkFlag = z.infer<typeof ArtworkFlag>;

export const RenderPreview = z.object({
  previewKey: z.string(),
  previewUrl: z.url(),
  widthPx: z.number().int().positive(),
  heightPx: z.number().int().positive(),
  flags: z.array(ArtworkFlag),
});

export const ITEM_ARTWORK_STATUSES = [
  "pending",
  "rendered",
  "flagged",
  "approved",
  "failed",
] as const;

/** Rendered artwork for one personalized order item. */
export const ItemArtwork = z.object({
  orderItemId: Id,
  orderId: Id,
  orderNo: z.string(),
  shipBy: Timestamp,
  designId: Id,
  designName: z.string(),
  templateId: Id,
  status: z.enum(ITEM_ARTWORK_STATUSES),
  /** Slot name -> text. Starts from the buyer's answers; edited by staff. */
  values: z.record(z.string(), z.string()),
  rawAnswers: z.array(z.object({ question: z.string(), answer: z.string().nullable() })),
  fileKey: z.string().nullable(),
  previewKey: z.string().nullable(),
  flags: z.array(ArtworkFlag),
  approvedBy: Id.nullable(),
  approvedAt: Timestamp.nullable(),
  renderedAt: Timestamp.nullable(),
  error: z.string().nullable(),
});
export type ItemArtwork = z.infer<typeof ItemArtwork>;
