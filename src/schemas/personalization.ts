import { z } from "zod";
import { Id, Inches, Timestamp } from "./common";

/** Fonts installed on the imaging service (v1-plan 5.1a); an unknown name is rejected, not
 * silently swapped for Inter (B-81). */
export const TEMPLATE_FONTS = [
  "Inter",
  "Inter Bold",
  "Inter Black",
  "Oswald",
  "Pacifico",
  "Bebas Neue",
] as const;

/** Mirrors imaging POST /render/personalization slots (v1-plan 5.1, B-81). */
export const TemplateSlot = z.object({
  name: z.string().min(1).max(40),
  kind: z.enum(["text", "photo"]),
  xIn: z.number().nonnegative(),
  yIn: z.number().nonnegative(),
  wIn: Inches,
  hIn: Inches,
  fontFamily: z.enum(TEMPLATE_FONTS),
  fontSizePt: z.number().positive(),
  /** Absolute shrink floor in points; null means the 60%-of-size default. The larger of the two
   * floors wins, so a slot never shrinks past whichever is more generous. */
  minFontSizePt: z.number().positive().nullable().default(null),
  /** Text wraps within the slot box, up to this many lines; null means unlimited. */
  maxLines: z.number().int().positive().nullable().default(null),
  /** Outline, for printing light text on dark shirts. */
  strokeWidthPt: z.number().nonnegative().default(0),
  strokeColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable()
    .default(null),
  /** Photo slots only: fit (letterboxed, whole photo visible) or fill (cropped to cover). */
  fit: z.enum(["fit", "fill"]).default("fit"),
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

// Kept unrefined so the update route can still call `.partial()` on it (zod v4 refuses
// `.partial()` on a schema with `.refine()`s); `PersonalizationTemplateInput` below adds the
// fast-fail checks for create, where the full shape is always present.
export const PersonalizationTemplateInputShape = z.object({
  name: z.string().min(1),
  widthIn: Inches.max(60),
  heightIn: Inches.max(60),
  backgroundKey: z.string().nullable().default(null),
  dpi: z.number().int().min(36).max(1200).default(300),
  slots: z.array(TemplateSlot).min(1),
});

export const PersonalizationTemplateInput = PersonalizationTemplateInputShape.refine(
  (t) => {
    const names = new Set<string>();
    for (const s of t.slots) {
      if (names.has(s.name)) return false;
      names.add(s.name);
    }
    return true;
  },
  { message: "Slot names must be unique", path: ["slots"] },
).refine(
  (t) =>
    t.slots.every((s) => s.xIn + s.wIn <= t.widthIn + 1e-6 && s.yIn + s.hIn <= t.heightIn + 1e-6),
  { message: "Every slot must stay inside the template's width/height", path: ["slots"] },
);

/** Mirrors imaging render flags plus the AI personalization check. */
export const ARTWORK_FLAG_CODES = [
  "overflow",
  "empty",
  "too_long",
  "suspicious_chars",
  "possible_typo",
  "odd_date",
  "missing_answer",
  "missing_glyphs",
  "low_res_photo",
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

/**
 * `purged` (0.14.0, appended last): buyer text and art were removed under the PII clocks (ADR 0025,
 * S-56). It is terminal for the render: re-enter the personalization to print again. Consumers with
 * an exhaustive switch or a `counts` literal must add the key.
 */
export const ITEM_ARTWORK_STATUSES = [
  "pending",
  "rendered",
  "flagged",
  "approved",
  "failed",
  "purged",
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
