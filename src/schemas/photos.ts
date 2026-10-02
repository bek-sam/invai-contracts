import { z } from "zod";
import type { Channel } from "../states";
import { Placement } from "./catalog";
import { Id, Ratio, Timestamp } from "./common";

/**
 * Listing photos (ADR 0023, decision 0022, spec `specs/listing-photos.md`).
 *
 * Phase A (wave 26): the shop's real design is composited by invai-imaging, at its real print
 * size and on the exact blank hex, onto garment templates drawn by code. Phase B (wave 27): an
 * image-generation provider draws a blank, masked scene; invai-imaging composites the design
 * afterward and two design-lock checks reject drift. No image model ever receives the design.
 * Every shape here is shared by both phases so wave 27 needs no contract change.
 */

export const GARMENT_TYPES = ["tee", "hoodie", "crewneck", "tank"] as const;
export const GarmentType = z.enum(GARMENT_TYPES);
export type GarmentType = z.infer<typeof GarmentType>;

/** Views a drawn template can show. `back` needs a back print file on the design. */
export const TEMPLATE_VIEWS = ["front_flat", "folded", "back", "on_model_white"] as const;
/** All views; `lifestyle` is phase B (an AI scene), requested through `lifestyle`, never `views`. */
export const PHOTO_VIEWS = [...TEMPLATE_VIEWS, "lifestyle"] as const;
export const PhotoView = z.enum(PHOTO_VIEWS);
export type PhotoView = z.infer<typeof PhotoView>;

/**
 * Channels with a photo preset. A subset of `CHANNELS` (`satisfies` keeps it from drifting):
 * `ebay` and `csv` have no image rules of their own.
 */
export const PHOTO_CHANNELS = [
  "amazon",
  "etsy",
  "shopify",
  "tiktok",
  "walmart",
] as const satisfies readonly Channel[];
export const PhotoChannel = z.enum(PHOTO_CHANNELS);
export type PhotoChannel = z.infer<typeof PhotoChannel>;

/** Render presets; imaging owns the numbers (wave 26 plan "Presets"), compliance checks them. */
export const PHOTO_PRESETS = [
  "amazon_main",
  "amazon_alt",
  "etsy",
  "shopify",
  "tiktok",
  "walmart",
] as const;
export const PhotoPreset = z.enum(PHOTO_PRESETS);
export type PhotoPreset = z.infer<typeof PhotoPreset>;

/** Which preset each channel's images use at a given slot: slot 0 is the main image. */
export function presetFor(channel: PhotoChannel, slot: number): PhotoPreset {
  if (channel === "amazon") return slot === 0 ? "amazon_main" : "amazon_alt";
  return channel;
}

/** `template`: drawn by code (not AI). `ai_scene`: the scene came from an image model (phase B). */
export const PHOTO_IMAGE_SOURCES = ["template", "ai_scene"] as const;
export const PhotoImageSource = z.enum(PHOTO_IMAGE_SOURCES);
export type PhotoImageSource = z.infer<typeof PhotoImageSource>;

/** Scene kinds the provider may draw (phase B); `buildScenePrompt` holds the rules per kind. */
export const PHOTO_SCENE_KINDS = [
  "studio",
  "home",
  "outdoor",
  "street",
  "cafe",
  "workplace",
  "flat_lay",
] as const;
export const PhotoSceneKind = z.enum(PHOTO_SCENE_KINDS);
export type PhotoSceneKind = z.infer<typeof PhotoSceneKind>;

/** A set ends `ready` even with failed images; `failed` only when nothing rendered (spec AC9). */
export const PHOTO_SET_STATUSES = ["queued", "rendering", "ready", "failed"] as const;
export const PhotoSetStatus = z.enum(PHOTO_SET_STATUSES);
export type PhotoSetStatus = z.infer<typeof PhotoSetStatus>;

/**
 * Image states. A person moves `rendered` to `approved` or `rejected` (and may change their
 * mind); `failed` is a render error or a design-lock rejection and is never approvable.
 */
export const PHOTO_IMAGE_STATUSES = [
  "queued",
  "rendering",
  "rendered",
  "approved",
  "rejected",
  "failed",
] as const;
export const PhotoImageStatus = z.enum(PHOTO_IMAGE_STATUSES);
export type PhotoImageStatus = z.infer<typeof PhotoImageStatus>;

export const PHOTO_IMAGE_TRANSITIONS: Readonly<
  Record<PhotoImageStatus, readonly PhotoImageStatus[]>
> = {
  queued: ["rendering", "failed"],
  rendering: ["rendered", "failed"],
  rendered: ["approved", "rejected"],
  approved: ["rejected"],
  rejected: ["approved"],
  failed: [],
};

export function canTransitionPhotoImage(from: PhotoImageStatus, to: PhotoImageStatus): boolean {
  return PHOTO_IMAGE_TRANSITIONS[from].includes(to);
}

/** Only these statuses may leave InvAI (zip, attach, push): decision 0022 §5. */
export const PHOTO_EXPORTABLE_STATUSES = [
  "approved",
] as const satisfies readonly PhotoImageStatus[];

/**
 * Automated check codes, shown to the shop in plain words, never hidden. Phase A codes first;
 * `design_drift` and `region_changed` are the phase B design-lock checks. Append only.
 */
export const PHOTO_CHECK_CODES = [
  "background_not_white", // Amazon main: background must be pure RGB 255
  "fill_below_min", // product fills less than the preset's minimum share of the frame
  "too_small", // longest side below the preset's minimum pixels
  "wrong_aspect", // square presets (shopify, tiktok, walmart) got a non-square frame
  "design_larger_than_print_area", // scaled down to fit, never clipped (spec AC6)
  "illustration_not_photo", // a drawn template where the channel wants a photograph (Amazon main)
  "design_drift", // phase B: composite vs source design below imaging's SSIM threshold
  "region_changed", // phase B: the garment outline around the print box moved after generation
] as const;
export const PhotoCheckCode = z.enum(PHOTO_CHECK_CODES);
export type PhotoCheckCode = z.infer<typeof PhotoCheckCode>;

export const PhotoCheckFailure = z.object({
  code: PhotoCheckCode,
  /** `error` blocks approval for that channel's main slot in the UI; `warn` only informs. */
  severity: z.enum(["error", "warn"]),
  /** Imaging's measured detail for the message ("fills 78%", "1400 px"); never buyer data. */
  detail: z.string().nullable(),
});
export type PhotoCheckFailure = z.infer<typeof PhotoCheckFailure>;

/** Mirrors imaging `/photo/render` and `/photo/scene-composite` `checks`. */
export const PhotoChecks = z.object({
  passes: z.boolean(),
  failures: z.array(PhotoCheckFailure),
  backgroundPureWhite: z.boolean().nullable(),
  fillRatio: Ratio.nullable(),
  longestSidePx: z.number().int().nonnegative().nullable(),
  /** Phase B check 1 (garment outline aligned), 0..1, null for templates. */
  regionUnchangedScore: Ratio.nullable(),
});
export type PhotoChecks = z.infer<typeof PhotoChecks>;

/** A blank color as the shop names it; hex is `#rrggbb` (either case). */
export const HexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Expected #rrggbb");
export const BlankColor = z.object({ name: z.string().min(1).max(60), hex: HexColor });
export type BlankColor = z.infer<typeof BlankColor>;

export const PaletteColor = z.object({ hex: HexColor, share: Ratio });

/** WCAG-style contrast between the art's dominant opaque colors and a blank, computed in code. */
export const ContrastWarning = z.object({
  blank: BlankColor,
  /** Contrast ratio 1..21 (WCAG), lower is harder to see. */
  ratio: z.number().min(1).max(21),
  /** `light_on_light` or `dark_on_dark`. */
  kind: z.enum(["light_on_light", "dark_on_dark"]),
});
export type ContrastWarning = z.infer<typeof ContrastWarning>;

export const SceneSuggestion = z.object({
  kind: PhotoSceneKind,
  description: z.string().max(300),
  /** Decides the synthetic-performer disclosure up front (conservative), never from the output. */
  containsPerson: z.boolean(),
});

/** Cached per design until `refresh`; produced by a job on the `ai` queue (ADR 0023). */
export const DesignPhotoAnalysis = z.object({
  designId: Id,
  /** `mock` is labelled "sample" in the UI (T-26-3 AC2). */
  source: z.enum(["model", "mock"]),
  model: z.string().nullable(),
  palette: z.array(PaletteColor).max(6),
  lightShare: Ratio,
  darkShare: Ratio,
  transparentShare: Ratio,
  style: z.string().max(300),
  audience: z.string().max(300),
  detectedText: z.string().max(500).nullable(),
  colorDescription: z.string().max(300),
  recommendedColors: z.array(BlankColor.extend({ reason: z.string().max(200) })).max(8),
  contrastWarnings: z.array(ContrastWarning),
  sceneSuggestions: z.array(SceneSuggestion).max(8),
  /** Per channel, plain and <= 250 chars; channels the model skipped are absent. */
  altText: z.partialRecord(PhotoChannel, z.string().max(250)),
  /** Suggested slot order per channel; the first view is the main image. */
  imageOrder: z.partialRecord(PhotoChannel, z.array(PhotoView)),
  creditsUsed: z.number().int().nonnegative(),
  analyzedAt: Timestamp,
});
export type DesignPhotoAnalysis = z.infer<typeof DesignPhotoAnalysis>;

export const AnalyzeDesignInput = z.object({
  designId: Id,
  /** Drop the cached analysis and run again (charges credits again). */
  refresh: z.boolean().default(false),
});

/** The analysis is a job: `pending` carries the job to poll; `failed` carries a readable reason. */
export const DesignPhotoAnalysisResult = z.discriminatedUnion("status", [
  z.object({ status: z.literal("ready"), analysis: DesignPhotoAnalysis }),
  z.object({ status: z.literal("pending"), jobId: Id }),
  z.object({ status: z.literal("failed"), error: z.string() }),
]);
export type DesignPhotoAnalysisResult = z.infer<typeof DesignPhotoAnalysisResult>;

/** Hard limit on template compositions (garments x colors x views) per set (spec AC20). */
export const MAX_PHOTO_COMPOSITIONS = 48;
/** Hard limit on AI scene images per set (phase B); the daily cap per shop is checked on top. */
export const MAX_PHOTO_LIFESTYLE_IMAGES = 8;
/** Most images one attach or push may carry (Etsy allows 20 per listing). */
export const MAX_PHOTO_IMAGES_PER_LISTING = 20;

export const LifestyleRequest = z.object({
  count: z.number().int().min(1).max(MAX_PHOTO_LIFESTYLE_IMAGES),
  /** Empty or absent: the analysis' suggested kinds, in order. */
  sceneKinds: z.array(PhotoSceneKind).max(MAX_PHOTO_LIFESTYLE_IMAGES).optional(),
});

/** What to render. Shared by `estimate` (no side effects) and `createSet` (plus the key). */
export const PhotoSetSpec = z
  .object({
    designId: Id,
    garments: z.array(GarmentType).min(1).max(GARMENT_TYPES.length),
    colors: z.array(BlankColor).min(1).max(12),
    views: z.array(z.enum(TEMPLATE_VIEWS)).min(1).max(TEMPLATE_VIEWS.length),
    channels: z.array(PhotoChannel).min(1).max(PHOTO_CHANNELS.length),
    /** Render semi-transparent pixels against a white underbase on dark blanks (spec AC8). */
    underbasePreview: z.boolean().default(true),
    lifestyle: LifestyleRequest.optional(),
  })
  .refine((s) => s.garments.length * s.colors.length * s.views.length <= MAX_PHOTO_COMPOSITIONS, {
    message: `At most ${MAX_PHOTO_COMPOSITIONS} compositions (garments x colors x views) per set`,
    path: ["views"],
  });
export type PhotoSetSpec = z.infer<typeof PhotoSetSpec>;

export const PhotoSetCreateInput = PhotoSetSpec.safeExtend({
  /** Client-generated, stable across retries; the same key returns the same set (spec AC10). */
  idempotencyKey: z.string().min(8).max(128),
});
export type PhotoSetCreateInput = z.infer<typeof PhotoSetCreateInput>;

/** Why a requested composition is left out (spec AC7: a missing back print is not offered). */
export const PHOTO_SKIP_REASONS = ["no_back_print_file", "duplicate_color"] as const;

export const PhotoEstimate = z.object({
  /** Distinct garment x view x color the design can show, plus one per AI scene. */
  compositions: z.number().int().nonnegative(),
  /** Compositions x channel presets (an AI scene also gets one image per channel). */
  images: z.number().int().nonnegative(),
  /** Credits the set would charge: PHOTO_TEMPLATE_CREDITS per template composition, PHOTO_SCENE_CREDITS per scene. */
  credits: z.number().int().nonnegative(),
  creditsRemaining: z.number().int(),
  /** False when `credits > creditsRemaining`: the UI disables generate with the shortfall. */
  canAfford: z.boolean(),
  skipped: z.array(
    z.object({
      garment: GarmentType,
      view: PhotoView,
      reason: z.enum(PHOTO_SKIP_REASONS),
    }),
  ),
});
export type PhotoEstimate = z.infer<typeof PhotoEstimate>;

/**
 * The charged unit (plan review item 5): one garment x view x color, rendered once per channel
 * preset, or one AI scene. Credits are charged once per composition, in the same transaction
 * that marks it rendered, never twice on retry.
 */
export const PhotoComposition = z.object({
  id: Id,
  setId: Id,
  source: PhotoImageSource,
  garment: GarmentType,
  view: PhotoView,
  color: BlankColor,
  /** `front` or `back` print file used; other placements are not photographed. */
  placement: Placement,
  sceneKind: PhotoSceneKind.nullable(),
  creditsCharged: z.number().int().nonnegative(),
  chargedAt: Timestamp.nullable(),
});
export type PhotoComposition = z.infer<typeof PhotoComposition>;

export const PhotoImage = z.object({
  id: Id,
  setId: Id,
  compositionId: Id,
  channel: PhotoChannel,
  preset: PhotoPreset,
  /** Position in the channel's image order; 0 is the main image. */
  slot: z.number().int().nonnegative(),
  garment: GarmentType,
  view: PhotoView,
  color: BlankColor,
  placement: Placement,
  source: PhotoImageSource,
  status: PhotoImageStatus,
  /** S3 key under the company prefix; null until rendered. Never a public URL. */
  key: z.string().nullable(),
  /** Short-lived signed URL, only from `getSet`; null in lists and until rendered. */
  url: z.url().nullable(),
  widthPx: z.number().int().positive().nullable(),
  heightPx: z.number().int().positive().nullable(),
  format: z.enum(["jpeg", "png"]).nullable(),
  checks: PhotoChecks.nullable(),
  /** Phase B check 2: SSIM of the printed region vs the source design, 0..1; null for templates. */
  designLockScore: Ratio.nullable(),
  /** The scene came from an image model (phase B). Triggers Etsy's AI-use disclosure. */
  aiGenerated: z.boolean(),
  /** A photoreal AI person is in the frame: XMP `contains-synthetic-performer` (Amazon rule). */
  containsSyntheticPerson: z.boolean(),
  /** Drawn garment or person: "illustration, not a photo"; not AI, no AI disclosure. */
  drawnTemplate: z.boolean(),
  altText: z.string().max(250).nullable(),
  /**
   * Credits attributed to this image: the composition's charge on its lead image (lowest slot of
   * the first channel), 0 on the other channel derivatives, so the sum over images equals the
   * set total.
   */
  creditsCharged: z.number().int().nonnegative(),
  /** Image model that drew the scene (phase B), null for templates. */
  model: z.string().nullable(),
  /** Readable reason when `failed` (imaging down, drift), in English; the web maps known codes. */
  error: z.string().nullable(),
  reviewedBy: Id.nullable(),
  reviewedAt: Timestamp.nullable(),
  createdAt: Timestamp,
  updatedAt: Timestamp,
});
export type PhotoImage = z.infer<typeof PhotoImage>;

export const PHOTO_ZIP_STATUSES = ["none", "queued", "building", "ready", "failed"] as const;

/** One zip per set; a channel-filtered export replaces it. Reused while the approval set is unchanged. */
export const PhotoZipState = z.object({
  status: z.enum(PHOTO_ZIP_STATUSES),
  channel: PhotoChannel.nullable(),
  /** Signed URL while `ready`, only from `getSet`. */
  url: z.url().nullable(),
  bytes: z.number().int().nonnegative().nullable(),
  imageCount: z.number().int().nonnegative(),
  builtAt: Timestamp.nullable(),
  error: z.string().nullable(),
});
export type PhotoZipState = z.infer<typeof PhotoZipState>;

export const PHOTO_PUSH_STATUSES = ["queued", "pushing", "pushed", "partial", "failed"] as const;

/** Why an image was left out of a zip, attach or push. */
export const PHOTO_EXCLUSION_REASONS = [
  "not_approved",
  "channel_mismatch",
  "not_in_set",
  "already_pushed",
] as const;
export const PhotoExclusion = z.object({ imageId: Id, reason: z.enum(PHOTO_EXCLUSION_REASONS) });

/** A Shopify image push (phase B), idempotent per (set, listing, image). */
export const PhotoPush = z.object({
  id: Id,
  setId: Id,
  connectionId: Id,
  listingId: Id,
  status: z.enum(PHOTO_PUSH_STATUSES),
  pushed: z.array(z.object({ imageId: Id, mediaId: z.string() })),
  skipped: z.array(PhotoExclusion),
  error: z.string().nullable(),
  requestedBy: Id.nullable(),
  requestedAt: Timestamp,
  completedAt: Timestamp.nullable(),
});
export type PhotoPush = z.infer<typeof PhotoPush>;

export const PhotoImageCounts = z.object({
  total: z.number().int().nonnegative(),
  queued: z.number().int().nonnegative(),
  rendering: z.number().int().nonnegative(),
  rendered: z.number().int().nonnegative(),
  approved: z.number().int().nonnegative(),
  rejected: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
});

/** List row: no images, one signed thumbnail at most (lesson P1). */
export const PhotoSetSummary = z.object({
  id: Id,
  designId: Id,
  designName: z.string(),
  status: PhotoSetStatus,
  garments: z.array(GarmentType),
  colors: z.array(BlankColor),
  views: z.array(z.enum(TEMPLATE_VIEWS)),
  channels: z.array(PhotoChannel),
  lifestyle: LifestyleRequest.nullable(),
  counts: PhotoImageCounts,
  creditsEstimated: z.number().int().nonnegative(),
  creditsCharged: z.number().int().nonnegative(),
  /** Any `ai_scene` image in the set (phase B): the Etsy disclosure applies when attached. */
  hasAiImages: z.boolean(),
  hasSyntheticPerson: z.boolean(),
  zip: PhotoZipState,
  /** Signed URL of the first rendered image (slot 0), for the list screen. */
  leadImageUrl: z.url().nullable(),
  error: z.string().nullable(),
  createdBy: Id.nullable(),
  createdAt: Timestamp,
  updatedAt: Timestamp,
});
export type PhotoSetSummary = z.infer<typeof PhotoSetSummary>;

export const PhotoSet = PhotoSetSummary.extend({
  compositions: z.array(PhotoComposition),
  images: z.array(PhotoImage),
  pushes: z.array(PhotoPush),
});
export type PhotoSet = z.infer<typeof PhotoSet>;

export const ReviewImagesInput = z
  .object({
    setId: Id,
    approve: z.array(Id).max(500).default([]),
    reject: z.array(Id).max(500).default([]),
  })
  .refine((r) => r.approve.length + r.reject.length > 0, {
    message: "Choose at least one image to approve or reject",
    path: ["approve"],
  })
  .refine((r) => !r.approve.some((id) => r.reject.includes(id)), {
    message: "An image cannot be both approved and rejected",
    path: ["reject"],
  });
export type ReviewImagesInput = z.infer<typeof ReviewImagesInput>;

export const ExportZipInput = z.object({
  setId: Id,
  /** Only this channel's approved images; absent: every channel, in channel folders. */
  channel: PhotoChannel.optional(),
});

export const ExportZipResult = z.object({
  jobId: Id,
  zip: PhotoZipState,
  included: z.number().int().nonnegative(),
  excluded: z.array(PhotoExclusion),
});

export const AttachToDraftInput = z.object({
  setId: Id,
  draftId: Id,
  imageIds: z.array(Id).min(1).max(MAX_PHOTO_IMAGES_PER_LISTING),
});

/** Draft field: set by any attached AI image and never cleared by later template attaches. */
export const ImageDisclosures = z.object({
  /** Some product photos are AI-generated scenes (Etsy AI-use disclosure on the listing). */
  aiGenerated: z.boolean(),
  /** An attached image shows a photoreal AI person (Amazon `contains-synthetic-performer`). */
  syntheticPerformer: z.boolean(),
});
export type ImageDisclosures = z.infer<typeof ImageDisclosures>;

/** A Shopify listing of the shop, from the backend `listings` table (plan review item 7). */
export const PushTarget = z.object({
  listingId: Id,
  connectionId: Id,
  connectionName: z.string(),
  channel: z.literal("shopify"),
  /** Shopify's numeric product id as stored; the backend maps it to the product gid. */
  channelListingId: z.string(),
  title: z.string(),
  url: z.url().nullable(),
  designId: Id.nullable(),
  /** True when the listing is already mapped to the requested design; sorted first. */
  matchesDesign: z.boolean(),
});
export type PushTarget = z.infer<typeof PushTarget>;

export const PushToShopifyInput = z.object({
  setId: Id,
  connectionId: Id,
  /** A listing of the same company, the same connection and channel shopify. */
  productRef: z.object({ listingId: Id }),
  imageIds: z.array(Id).min(1).max(MAX_PHOTO_IMAGES_PER_LISTING),
  idempotencyKey: z.string().min(8).max(128),
});
export type PushToShopifyInput = z.infer<typeof PushToShopifyInput>;

/** Reasons behind a typed `BAD_REQUEST` from `photos.*`; the web maps each to a sentence. */
export const PHOTO_BAD_REQUEST_REASONS = [
  "too_many_compositions",
  "view_not_available", // e.g. back view, no back print file
  "design_archived",
  "no_print_file",
  "not_approved", // `count` = images still waiting for review
  "channel_mismatch", // image channel != draft channel
  "image_not_in_set",
  "not_reviewable", // approving a queued or failed image
  "not_shopify_connection",
  "listing_not_on_connection",
] as const;
export type PhotoBadRequestReason = (typeof PHOTO_BAD_REQUEST_REASONS)[number];
