import { z } from "zod";
import { ListingDraft } from "../schemas/ai";
import { Id, Page, paginated, Timestamp } from "../schemas/common";
import {
  AnalyzeDesignInput,
  AttachToDraftInput,
  DesignPhotoAnalysisResult,
  ExportZipInput,
  ExportZipResult,
  PHOTO_BAD_REQUEST_REASONS,
  PhotoEstimate,
  PhotoExclusion,
  PhotoPush,
  PhotoSet,
  PhotoSetCreateInput,
  PhotoSetSpec,
  PhotoSetStatus,
  PhotoSetSummary,
  PushTarget,
  PushToShopifyInput,
  ReviewImagesInput,
} from "../schemas/photos";
import { base, proc } from "./_base";
import { CREDIT_ERRORS, SPEND_CAP_ERRORS } from "./ai";

/**
 * Listing photos (ADR 0023). Phase A (wave 26, backend-engineer T-26-4): templates drawn by
 * code, the real design composited by imaging. Phase B (wave 27, T-27-3): AI lifestyle scenes
 * and the Shopify image push; its procedures are stubbed (NOT_IMPLEMENTED) until then.
 *
 * Rate buckets (backend `bucketFor`, plan review item 1): `analyzeDesign`, `createSet` and
 * `pushToShopify` spend credits or call a provider, so they go to the `ai` bucket; `estimate`
 * is a non-GET read.
 */

/** A rule of the request itself, not a missing row: `reason` is one of PHOTO_BAD_REQUEST_REASONS. */
export const PHOTO_BAD_REQUEST = {
  BAD_REQUEST: {
    status: 400,
    message: "This request can't be fulfilled as given",
    data: z.object({
      reason: z.enum(PHOTO_BAD_REQUEST_REASONS),
      /** For `not_approved`: images still waiting for review; for `too_many_compositions`: the count. */
      count: z.number().int().nonnegative().nullable(),
    }),
  },
} as const;

/** Phase B: per-shop daily cap on AI scene images (`IMAGE_GEN_DAILY_CAP_PER_SHOP`, default 30). */
export const IMAGE_CAP_ERRORS = {
  IMAGE_DAILY_CAP_REACHED: {
    status: 429,
    message: "Daily limit for AI scene images reached; try again after it resets",
    data: z.object({
      cap: z.number().int().nonnegative(),
      used: z.number().int().nonnegative(),
      resetAt: Timestamp,
    }),
  },
} as const;

export const photos = base
  .prefix("/photos")
  .tag("photos")
  .router({
    /**
     * Cached analysis of a design for photos, or enqueue it on the `ai` queue and answer
     * `pending` (never a transaction across the model call). Another tenant's design: NOT_FOUND.
     */
    analyzeDesign: proc("photos.manage")
      .route({ method: "POST", path: "/analyze" })
      .input(AnalyzeDesignInput)
      .output(DesignPhotoAnalysisResult)
      .errors({ ...CREDIT_ERRORS, ...SPEND_CAP_ERRORS, ...PHOTO_BAD_REQUEST }),
    /** No side effects: compositions, images and credits the spec would cost, plus what is skipped. */
    estimate: proc("photos.read")
      .route({ method: "POST", path: "/estimate" })
      .input(PhotoSetSpec)
      .output(PhotoEstimate)
      .errors(PHOTO_BAD_REQUEST),
    /**
     * Creates the set and enqueues one render job per composition; nothing renders in the
     * request. Idempotent on `idempotencyKey` (same key, same set, no second job). Refused up
     * front when credits are short or (phase B) a cap is hit.
     */
    createSet: proc("photos.manage")
      .route({ method: "POST", path: "/sets" })
      .input(PhotoSetCreateInput)
      .output(PhotoSet)
      .errors({
        ...CREDIT_ERRORS,
        ...SPEND_CAP_ERRORS,
        ...IMAGE_CAP_ERRORS,
        ...PHOTO_BAD_REQUEST,
      }),
    listSets: proc("photos.read")
      .route({ method: "GET", path: "/sets" })
      .input(
        Page.extend({
          designId: Id.optional(),
          status: z.array(PhotoSetStatus).optional(),
        }),
      )
      .output(paginated(PhotoSetSummary)),
    /** Full set with signed URLs for rendered images and the zip (company-prefix keys only). */
    getSet: proc("photos.read")
      .route({ method: "GET", path: "/sets/{id}" })
      .input(z.object({ id: Id }))
      .output(PhotoSet),
    /**
     * A person approves or rejects rendered images (decision 0022 §5). `failed`, `queued` and
     * `rendering` images are refused with BAD_REQUEST `not_reviewable`.
     */
    reviewImages: proc("photos.manage")
      .route({ method: "POST", path: "/sets/{setId}/review" })
      .input(ReviewImagesInput)
      .output(PhotoSet)
      .errors(PHOTO_BAD_REQUEST),
    /**
     * Enqueues the zip of approved images (by channel folders, or one channel). Nothing approved:
     * BAD_REQUEST `not_approved` with the count still waiting. Reuses the zip when the approval
     * set is unchanged.
     */
    exportZip: proc("photos.manage")
      .route({ method: "POST", path: "/sets/{setId}/zip" })
      .input(ExportZipInput)
      .output(ExportZipResult)
      .errors(PHOTO_BAD_REQUEST),
    /**
     * Appends approved images to an AI listing draft of the same design and channel and sets its
     * `imageDisclosures` from the images' flags. Unapproved or foreign ids: BAD_REQUEST. A draft
     * that is `publishing`: CONFLICT.
     */
    attachToDraft: proc("photos.manage")
      .route({ method: "POST", path: "/sets/{setId}/attach" })
      .input(AttachToDraftInput)
      .output(
        z.object({
          draft: ListingDraft,
          attached: z.number().int().nonnegative(),
          excluded: z.array(PhotoExclusion),
        }),
      )
      .errors(PHOTO_BAD_REQUEST),
    /**
     * Phase B. The shop's Shopify listings a push can target, this design's first. Read from the
     * backend `listings` table (plan review item 7). Bounded per connection, still paginated.
     */
    pushTargets: proc("photos.read")
      .route({ method: "GET", path: "/push-targets" })
      .input(
        Page.extend({ designId: Id, connectionId: Id.optional(), search: z.string().optional() }),
      )
      .output(paginated(PushTarget)),
    /**
     * Phase B. Enqueues a push of approved images to one Shopify product; idempotent on the key
     * and per (set, listing, image). Result per image lands on `getSet().pushes`.
     */
    pushToShopify: proc("photos.manage")
      .route({ method: "POST", path: "/sets/{setId}/push" })
      .input(PushToShopifyInput)
      .output(PhotoPush)
      .errors(PHOTO_BAD_REQUEST),
  });
