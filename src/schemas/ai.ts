import { z } from "zod";
import { CHANNELS, LISTING_DRAFT_STATES } from "../states";
import { Cents, Id, Timestamp } from "./common";

export const ListingContent = z.object({
  title: z.string(),
  description: z.string(),
  tags: z.array(z.string()),
  bullets: z.array(z.string()),
  /** Channel attributes (Amazon item type, Etsy category, materials...). */
  attributes: z.record(z.string(), z.string()),
  price: Cents.nullable(),
  /** Added automatically: AI-use and production-partner disclosures required by the channel. */
  disclosures: z.array(z.string()),
  /** Filled in at generation time from the company's `productionPartner` setting. Never model-generated. */
  productionPartner: z.string().nullable(),
});
export type ListingContent = z.infer<typeof ListingContent>;

export const ValidationIssue = z.object({
  field: z.enum([
    "title",
    "description",
    "tags",
    "bullets",
    "attributes",
    "price",
    "disclosures",
    "productionPartner",
  ]),
  rule: z.string(), // e.g. "title_max_140"
  message: z.string(),
  index: z.number().int().nonnegative().nullable(), // tag/bullet index
});

/** Result of the deterministic channel-rule validator (CHANNEL_RULES listing limits). */
export const ValidationResult = z.object({
  channel: z.enum(CHANNELS),
  ok: z.boolean(),
  errors: z.array(ValidationIssue),
  warnings: z.array(ValidationIssue),
  checkedAt: Timestamp,
});
export type ValidationResult = z.infer<typeof ValidationResult>;

export const TrademarkMatch = z.object({
  mark: z.string(),
  serialNo: z.string().nullable(),
  owner: z.string().nullable(),
  /** Trigram similarity 0..1 against the matched text. */
  similarity: z.number().min(0).max(1),
  matchedText: z.string(),
  source: z.enum(["title", "tags", "description", "design_text", "input_text"]),
  /** Claude's judgement of the ambiguous match, when it ran. */
  judgement: z.enum(["conflict", "possible", "unrelated"]).nullable(),
});

export const TrademarkCheck = z.object({
  riskScore: z.number().int().min(0).max(100),
  riskLevel: z.enum(["low", "medium", "high"]),
  matches: z.array(TrademarkMatch),
  /** Plain-language reasoning. Shown with "not legal advice". */
  explanation: z.string(),
  ocrText: z.string().nullable(),
  checkedAt: Timestamp,
});
export type TrademarkCheck = z.infer<typeof TrademarkCheck>;

export const TrademarkCheckInput = z
  .object({
    text: z.string().max(5000).optional(),
    designId: Id.optional(),
    channel: z.enum(CHANNELS).optional(),
  })
  .refine((v) => v.text !== undefined || v.designId !== undefined, "text or designId is required");

/** A compliance-officer sign-off recorded on a medium-risk draft (`ai.listings.recordTrademarkReview`). */
export const TrademarkReview = z.object({
  reviewedBy: Id,
  reviewedAt: Timestamp,
  note: z.string().min(3),
});
export type TrademarkReview = z.infer<typeof TrademarkReview>;

export const ListingDraft = z.object({
  id: Id,
  designId: Id,
  designName: z.string(),
  channel: z.enum(CHANNELS),
  connectionId: Id.nullable(),
  productId: Id.nullable(),
  status: z.enum(LISTING_DRAFT_STATES),
  content: ListingContent,
  validation: ValidationResult.nullable(),
  trademark: TrademarkCheck.nullable(),
  /** Set once a compliance review is recorded for a medium-risk draft (25 <= riskScore < 60). */
  trademarkReview: TrademarkReview.nullable(),
  mockupKeys: z.array(z.string()),
  model: z.string().nullable(),
  creditsUsed: z.number().int().nonnegative(),
  approvedBy: Id.nullable(),
  approvedAt: Timestamp.nullable(),
  rejectedReason: z.string().nullable(),
  publishedListingId: z.string().nullable(),
  publishedUrl: z.url().nullable(),
  error: z.string().nullable(),
  createdAt: Timestamp,
  updatedAt: Timestamp,
});
export type ListingDraft = z.infer<typeof ListingDraft>;

export const ListingDraftCreateInput = z.object({
  designId: Id,
  channels: z.array(z.enum(CHANNELS)).min(1),
  productId: Id.optional(),
  /** Free-text guidance, e.g. "funny, for dog moms". Never buyer data. */
  brief: z.string().max(2000).optional(),
  /** Uses the Message Batches API (cheaper, async). */
  batch: z.boolean().default(false),
});

export const PublishStatus = z.object({
  draftId: Id,
  status: z.enum(LISTING_DRAFT_STATES),
  publishedListingId: z.string().nullable(),
  publishedUrl: z.url().nullable(),
  error: z.string().nullable(),
  /** Channel API not approved yet: the draft stays approved and can be copied by hand. */
  pendingApproval: z.boolean(),
});

export const AssistantAskInput = z.object({
  message: z.string().min(1).max(4000),
  conversationId: Id.optional(),
});

/** Streamed via an oRPC event iterator. `done` is always the last event. */
export const AssistantEvent = z.discriminatedUnion("type", [
  z.object({ type: z.literal("start"), conversationId: Id, messageId: Id }),
  z.object({ type: z.literal("text_delta"), text: z.string() }),
  z.object({
    type: z.literal("tool_call"),
    name: z.enum([
      "get_profit",
      "get_orders_summary",
      "get_stock",
      "get_listing_performance",
      "get_channel_performance",
      // Added in wave 17 (T-17-1, spec assistant-business-analyst): additive, enum values at the
      // end. get_production_status already existed as a backend-only tool (T-13); the other four
      // are new analyst tools built in T-17-2.
      "get_production_status",
      "compare_periods",
      "get_ad_performance",
      "get_design_insights",
      "get_fulfillment_health",
    ]),
    input: z.record(z.string(), z.unknown()),
  }),
  z.object({ type: z.literal("tool_result"), name: z.string(), summary: z.string() }),
  z.object({
    type: z.literal("error"),
    message: z.string(),
    code: z.enum(["credits_exhausted", "rate_limited", "refusal", "spend_cap", "internal"]),
  }),
  z.object({
    type: z.literal("done"),
    conversationId: Id,
    messageId: Id,
    creditsUsed: z.number().int().nonnegative(),
  }),
]);
export type AssistantEvent = z.infer<typeof AssistantEvent>;

export const AssistantMessage = z.object({
  id: Id,
  role: z.enum(["user", "assistant"]),
  text: z.string(),
  createdAt: Timestamp,
});

export const AssistantConversation = z.object({
  id: Id,
  title: z.string(),
  messages: z.array(AssistantMessage),
  createdAt: Timestamp,
  updatedAt: Timestamp,
});

export const CREDIT_KINDS = [
  "allowance", // monthly plan credits
  "pack", // purchased pack
  "listing_draft",
  "sku_suggestion",
  "trademark_check",
  "personalization_check",
  "assistant",
  "mockup",
] as const;

export const CreditsBalance = z.object({
  periodStart: Timestamp,
  periodEnd: Timestamp,
  allowance: z.number().int().nonnegative(),
  packs: z.number().int().nonnegative(),
  used: z.number().int().nonnegative(),
  remaining: z.number().int(),
  /** AI features pause when remaining hits 0 (billing.plan limits). */
  paused: z.boolean(),
});
export type CreditsBalance = z.infer<typeof CreditsBalance>;

export const CreditEntry = z.object({
  id: Id,
  at: Timestamp,
  kind: z.enum(CREDIT_KINDS),
  /** Positive for allowance/pack, negative for usage. */
  credits: z.number().int(),
  model: z.string().nullable(),
  tokensIn: z.number().int().nonnegative().nullable(),
  tokensOut: z.number().int().nonnegative().nullable(),
  cacheReadTokens: z.number().int().nonnegative().nullable(),
  ref: z.object({ type: z.string(), id: Id }).nullable(),
  userId: Id.nullable(),
});
export type CreditEntry = z.infer<typeof CreditEntry>;
