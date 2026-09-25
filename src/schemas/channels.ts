import { z } from "zod";
import { CONNECTABLE_CHANNELS, CSV_FORMATS } from "../channels";
import { CHANNELS } from "../states";
import { Id, Timestamp } from "./common";

export const CONNECTION_STATUSES = [
  "pending", // OAuth started, not finished
  "connected",
  "csv_only",
  "error",
  "disconnected",
] as const;

export const ConnectionHealth = z.object({
  ok: z.boolean(),
  lastWebhookAt: Timestamp.nullable(),
  lastPollAt: Timestamp.nullable(),
  lastImportAt: Timestamp.nullable(),
  ordersLast24h: z.number().int().nonnegative(),
  errorsLast24h: z.number().int().nonnegative(),
  lastError: z.string().nullable(),
  /** Adapter exists but the marketplace app is not approved; CSV import works meanwhile. */
  pendingApproval: z.boolean(),
  /** Minutes since the last successful sync; alert threshold is 30. */
  staleMinutes: z.number().int().nonnegative().nullable(),
});
export type ConnectionHealth = z.infer<typeof ConnectionHealth>;

export const ConnectionSettings = z.object({
  autoImport: z.boolean(),
  /** Overrides CHANNEL_RULES[channel].shipBy.defaultDays when the channel sends no ship-by. */
  processingDays: z.number().int().nonnegative().nullable(),
  /** Hours before ship-by at which an unlabeled order becomes at risk. */
  riskWindowHours: z.number().int().positive(),
  pushTracking: z.boolean(),
  pushAvailability: z.boolean(),
});

export const ChannelConnection = z.object({
  id: Id,
  channel: z.enum(CHANNELS),
  name: z.string(), // shop name on the channel
  status: z.enum(CONNECTION_STATUSES),
  mode: z.enum(["api", "csv"]),
  externalShopId: z.string().nullable(),
  /** Real adapter or the mock provider (no API key). */
  provider: z.enum(["live", "mock"]),
  settings: ConnectionSettings,
  health: ConnectionHealth,
  connectedAt: Timestamp.nullable(),
  createdAt: Timestamp,
});
export type ChannelConnection = z.infer<typeof ChannelConnection>;

export const ConnectInput = z.discriminatedUnion("channel", [
  z.object({
    channel: z.literal("shopify"),
    shopDomain: z.string().regex(/^[a-z0-9-]+\.myshopify\.com$/),
  }),
  z.object({
    channel: z.enum(
      CONNECTABLE_CHANNELS.filter((c) => c !== "shopify") as [
        "etsy",
        "amazon",
        "tiktok",
        "walmart",
      ],
    ),
    name: z.string().min(1),
    mode: z.enum(["api", "csv"]).default("csv"),
  }),
]);

export const ConnectResult = z.discriminatedUnion("kind", [
  /** Redirect the browser; the callback lands on /webhooks/shopify/oauth and finishes the connection. */
  z.object({ kind: z.literal("oauth"), connectionId: Id, authorizeUrl: z.url() }),
  z.object({ kind: z.literal("created"), connection: ChannelConnection }),
]);

export const CsvFormat = z.enum(CSV_FORMATS);
export type CsvFormat = z.infer<typeof CsvFormat>;

export const ImportReport = z.object({
  importId: Id,
  connectionId: Id,
  format: CsvFormat,
  fileKey: z.string(),
  /** `queued`/`running` only for imports over the sync-inline row threshold; poll via `channels.imports` or `production.jobs.get(jobId)`. */
  status: z.enum(["completed", "failed", "queued", "running"]),
  /** Set only when the import runs as a job (over threshold); null for the synchronous path. */
  jobId: Id.nullable().optional(),
  rowsTotal: z.number().int().nonnegative(),
  ordersImported: z.number().int().nonnegative(),
  ordersUpdated: z.number().int().nonnegative(),
  ordersSkipped: z.number().int().nonnegative(), // already imported and unchanged
  rowsFailed: z.number().int().nonnegative(),
  itemsNeedingMapping: z.number().int().nonnegative(),
  errors: z.array(z.object({ row: z.number().int().positive(), message: z.string() })),
  orderIds: z.array(Id),
  startedAt: Timestamp,
  finishedAt: Timestamp.nullable(),
});
export type ImportReport = z.infer<typeof ImportReport>;

export const SKU_PATTERN_TYPES = ["exact", "regex", "template"] as const;

/** Placeholders a template pattern may use; a regex uses the same names as named groups. */
export const SKU_TEMPLATE_FIELDS = ["design", "style", "color", "size", "brand"] as const;

/**
 * How a matched SKU resolves to a design + blank variant.
 * `direct`: the rule names both ids (exact patterns).
 * `resolve`: captured fields are looked up by code: Design.code, BlankVariant.styleCode,
 * colorCode, sizeCode (template `{style}-{color}-{size}-{design}` or regex named groups).
 */
export const SkuRuleTarget = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("direct"), designId: Id, blankVariantId: Id }),
  z.object({
    kind: z.literal("resolve"),
    /** Fixed values for fields the pattern does not capture, e.g. {"brand": "gildan"}. */
    defaults: z.partialRecord(z.enum(SKU_TEMPLATE_FIELDS), z.string()).default({}),
  }),
]);

export const SkuRule = z.object({
  id: Id,
  name: z.string().nullable(),
  patternType: z.enum(SKU_PATTERN_TYPES),
  pattern: z.string(),
  channel: z.enum(CHANNELS).nullable(), // null = any channel
  connectionId: Id.nullable(),
  target: SkuRuleTarget,
  /** Higher wins when several rules match; exact rules always beat patterns. */
  priority: z.number().int(),
  active: z.boolean(),
  source: z.enum(["manual", "learned", "suggested"]),
  matchCount: z.number().int().nonnegative(),
  lastMatchedAt: Timestamp.nullable(),
  createdAt: Timestamp,
  updatedAt: Timestamp,
});
export type SkuRule = z.infer<typeof SkuRule>;

export const SkuRuleInput = z.object({
  name: z.string().nullable().default(null),
  patternType: z.enum(SKU_PATTERN_TYPES),
  pattern: z.string().min(1),
  channel: z.enum(CHANNELS).nullable().default(null),
  connectionId: Id.nullable().default(null),
  target: SkuRuleTarget,
  priority: z.number().int().default(0),
  active: z.boolean().default(true),
});

export const UnmappedSku = z.object({
  channelSku: z.string(),
  channel: z.enum(CHANNELS),
  connectionId: Id,
  itemCount: z.number().int().positive(),
  orderCount: z.number().int().positive(),
  sampleTitle: z.string().nullable(),
  sampleVariantTitle: z.string().nullable(),
  earliestShipBy: Timestamp.nullable(),
  firstSeenAt: Timestamp,
  lastSeenAt: Timestamp,
});
export type UnmappedSku = z.infer<typeof UnmappedSku>;

export const SkuSuggestion = z.object({
  channelSku: z.string(),
  designId: Id.nullable(),
  blankVariantId: Id.nullable(),
  /** A rule that would cover this SKU and others like it. */
  rule: z
    .object({
      patternType: z.enum(SKU_PATTERN_TYPES),
      pattern: z.string(),
      target: SkuRuleTarget,
      wouldMatchCount: z.number().int().nonnegative(),
    })
    .nullable(),
  confidence: z.number().min(0).max(1),
  source: z.enum(["rule", "heuristic", "ai"]),
  explanation: z.string(),
});
export type SkuSuggestion = z.infer<typeof SkuSuggestion>;

export const SkuMatchResult = z.object({
  matched: z.boolean(),
  fields: z.partialRecord(z.enum(SKU_TEMPLATE_FIELDS), z.string()),
  designId: Id.nullable(),
  blankVariantId: Id.nullable(),
  error: z.string().nullable(),
});
