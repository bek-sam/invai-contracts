import { eventIterator } from "@orpc/contract";
import { z } from "zod";
import {
  AssistantAskInput,
  AssistantConversation,
  AssistantEvent,
  CREDIT_KINDS,
  CreditEntry,
  CreditsBalance,
  ListingContent,
  ListingDraft,
  ListingDraftCreateInput,
  PublishStatus,
  TrademarkCheck,
  TrademarkCheckInput,
  ValidationResult,
} from "../schemas/ai";
import { Id, JobRef, Page, paginated, Timestamp } from "../schemas/common";
import { CHANNELS, LISTING_DRAFT_STATES } from "../states";
import { base, proc } from "./_base";

const CREDIT_ERRORS = {
  CREDITS_EXHAUSTED: {
    status: 402,
    message: "AI credits used up for this period",
    data: z.object({ remaining: z.number(), periodEnd: z.string() }),
  },
} as const;

const listings = base.prefix("/listings").router({
  /** One draft per channel. Generation runs in the `ai` queue; drafts start `generating`. */
  create: proc("ai.listings.manage")
    .route({ method: "POST", path: "/" })
    .input(ListingDraftCreateInput)
    .output(JobRef.extend({ drafts: z.array(ListingDraft) }))
    .errors(CREDIT_ERRORS),
  list: proc("ai.listings.read")
    .route({ method: "GET", path: "/" })
    .input(
      Page.extend({
        status: z.array(z.enum(LISTING_DRAFT_STATES)).optional(),
        channel: z.enum(CHANNELS).optional(),
        designId: Id.optional(),
        search: z.string().optional(),
      }),
    )
    .output(
      paginated(ListingDraft).extend({
        counts: z.record(z.enum(LISTING_DRAFT_STATES), z.number().int().nonnegative()),
      }),
    ),
  get: proc("ai.listings.read")
    .route({ method: "GET", path: "/{id}" })
    .input(z.object({ id: Id }))
    .output(ListingDraft),
  /** Edit content; re-runs validation and (when title/tags change) the trademark check. */
  update: proc("ai.listings.manage")
    .route({ method: "PATCH", path: "/{id}" })
    .input(z.object({ id: Id, content: ListingContent.partial() }))
    .output(ListingDraft),
  /** Human approval, required before anything is published (Etsy Creativity Standards). */
  approve: proc("ai.listings.approve")
    .route({ method: "POST", path: "/{id}/approve" })
    .input(z.object({ id: Id, acknowledgeRisk: z.boolean().default(false) }))
    .output(ListingDraft)
    .errors({
      VALIDATION_FAILED: {
        status: 422,
        message: "Draft violates channel rules",
        data: ValidationResult,
      },
      HIGH_TRADEMARK_RISK: {
        status: 409,
        message: "High trademark risk; pass acknowledgeRisk to approve anyway",
        data: TrademarkCheck,
      },
    }),
  reject: proc("ai.listings.approve")
    .route({ method: "POST", path: "/{id}/reject" })
    .input(z.object({ id: Id, reason: z.string().max(500).optional() }))
    .output(ListingDraft),
  /** Push an approved draft through the channel adapter (Shopify live; others pending approval / mock). */
  publish: proc("ai.listings.approve")
    .route({ method: "POST", path: "/{id}/publish" })
    .input(z.object({ id: Id, connectionId: Id }))
    .output(PublishStatus),
  publishStatus: proc("ai.listings.read")
    .route({ method: "GET", path: "/{id}/publish-status" })
    .input(z.object({ id: Id }))
    .output(PublishStatus),
  /** Re-generate one draft with extra guidance. */
  regenerate: proc("ai.listings.manage")
    .route({ method: "POST", path: "/{id}/regenerate" })
    .input(z.object({ id: Id, brief: z.string().max(2000).optional() }))
    .output(JobRef)
    .errors(CREDIT_ERRORS),
});

const assistant = base.prefix("/assistant").router({
  /**
   * Streams the answer as an event iterator (SSE under the hood). Tools are read-only and
   * run under the caller's RLS context; buyer PII never reaches the model.
   */
  ask: proc("ai.assistant.ask")
    .route({ method: "POST", path: "/ask" })
    .input(AssistantAskInput)
    .output(eventIterator(AssistantEvent))
    .errors(CREDIT_ERRORS),
  conversations: proc("ai.assistant.ask")
    .route({ method: "GET", path: "/conversations" })
    .input(Page)
    .output(paginated(AssistantConversation.omit({ messages: true }))),
  conversation: proc("ai.assistant.ask")
    .route({ method: "GET", path: "/conversations/{id}" })
    .input(z.object({ id: Id }))
    .output(AssistantConversation),
});

const credits = base.prefix("/credits").router({
  balance: proc("ai.credits.read")
    .route({ method: "GET", path: "/" })
    .input(z.object({}))
    .output(CreditsBalance),
  ledger: proc("ai.credits.read")
    .route({ method: "GET", path: "/ledger" })
    .input(
      Page.extend({
        kind: z.array(z.enum(CREDIT_KINDS)).optional(),
        from: Timestamp.optional(),
        to: Timestamp.optional(),
      }),
    )
    .output(paginated(CreditEntry)),
});

export const ai = base
  .prefix("/ai")
  .tag("ai")
  .router({
    listings,
    assistant,
    credits,
    /** One CSV row per variant (not per draft): a draft covering several variants expands to
     * one row per variant, each with its own real SKU. Returns the file's S3 key. */
    exportCsv: proc("ai.listings.manage")
      .route({ method: "POST", path: "/listings/export-csv" })
      .input(z.object({ draftIds: z.array(Id).min(1).max(500), channel: z.enum(CHANNELS) }))
      .output(z.object({ key: z.string() }))
      .errors({
        CHANNEL_MISMATCH: {
          status: 400,
          message: "A draft's channel does not match the export channel",
        },
      }),
    /** Deterministic channel-rule validation of arbitrary content (used live while editing). */
    validate: proc("ai.listings.read")
      .route({ method: "POST", path: "/validate" })
      .input(z.object({ channel: z.enum(CHANNELS), content: ListingContent.partial() }))
      .output(ValidationResult),
    /** Trigram match against class-25 marks, Claude judges ambiguous hits. Not legal advice. */
    trademarkCheck: proc("ai.trademark.check")
      .route({ method: "POST", path: "/trademark-check" })
      .input(TrademarkCheckInput)
      .output(TrademarkCheck)
      .errors(CREDIT_ERRORS),
  });
