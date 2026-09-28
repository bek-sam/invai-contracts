import { z } from "zod";
import { CHANNELS } from "../states";
import { Cents, DateOnly, Id, Ratio, Timestamp } from "./common";
import { MarketRecommendation } from "./market";

/**
 * The weekly business review digest (wave 19, `specs/weekly-digest.md`, ADR 0014 fences).
 *
 * Every number is computed by code in `invai-backend/src/modules/digest` with the same functions
 * as the profit page and the analyst tools; the apps render copy from the spec's template keys
 * plus these facts, never from free text. Money is integer cents, percents are `*Pct`, shares are
 * 0..1 ratios, dates are ISO strings. No narrative text field exists in 0.7.0: the AI summary runs
 * in shadow mode (built, validated, stored, never sent), so only `narrativeStatus` is exposed. An
 * optional `summary` is added additively when OI-8 flips the mode.
 */

/** ISO week key, e.g. `2026-W39`: Monday 00:00 to Monday 00:00 in the shop's time zone. */
export const WEEK_KEY_PATTERN = /^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/;
export const WeekKey = z.string().regex(WEEK_KEY_PATTERN, "week key like 2026-W39");
export type WeekKey = z.infer<typeof WeekKey>;

/**
 * Client-visible statuses only. `building` and `failed` are DB-only states in the backend
 * (spec pipeline 1: a half-built digest is never shown; the page shows the "not ready yet" empty
 * state until the row is `ready`). `skipped_quiet`: zero orders and no open issues, no email sent.
 */
export const DIGEST_STATUSES = ["ready", "skipped_quiet"] as const;
export const DigestStatus = z.enum(DIGEST_STATUSES);
export type DigestStatus = z.infer<typeof DigestStatus>;

/**
 * What happened to the optional AI summary. `none`: not attempted (quiet week, nobody will read
 * it); `shadow`: generated and validated but never shown (until OI-8); `ok`: validated and, once
 * the global mode is `on`, shown; `rejected`: failed the validator, template used;
 * `skipped_budget`: weekly cap or credit reserve hit; `skipped_off`: shop or global switch off.
 */
export const NARRATIVE_STATUSES = [
  "none",
  "shadow",
  "ok",
  "rejected",
  "skipped_budget",
  "skipped_off",
] as const;
export const NarrativeStatus = z.enum(NARRATIVE_STATUSES);
export type NarrativeStatus = z.infer<typeof NarrativeStatus>;

/** Global AI-summary mode (spec kill switches), read-only for shops; `shadow` disables the shop toggle (AC33). */
export const AI_SUMMARY_MODES = ["off", "shadow", "on"] as const;
export const AiSummaryMode = z.enum(AI_SUMMARY_MODES);
export type AiSummaryMode = z.infer<typeof AiSummaryMode>;

/** Detectors D1..D8 (spec step 5) plus `market` for a Market watch item (wave 18 recommendation). */
export const DIGEST_DETECTORS = ["D1", "D2", "D3", "D4", "D5", "D6", "D7", "D8", "market"] as const;
export const DigestDetector = z.enum(DIGEST_DETECTORS);
export type DigestDetector = z.infer<typeof DigestDetector>;

/**
 * The fixed action per detector (spec "Copy": `D1 action`..`D7 action`). Apps render the wording
 * from `kind` + `params` in the user's language and open `href`. `none` is a win (D8: celebrate);
 * `market` carries the recommendation's own rule action (`MarketRecommendation.action`).
 */
export const DIGEST_ACTION_KINDS = [
  "reconnect_channel", // D1
  "see_what_changed", // D2
  "review_costs", // D3
  "review_ads", // D4
  "list_design", // D5 cross-listing gap
  "review_price", // D5 low margin
  "ship_overdue", // D6 overdue orders
  "see_reprints", // D6 reprint spike
  "reorder_blank", // D7
  "market", // Market watch item promoted or shown; action is the recommendation's rule action
  "none", // D8 win
] as const;
export const DigestActionKind = z.enum(DIGEST_ACTION_KINDS);
export type DigestActionKind = z.infer<typeof DigestActionKind>;

/** Units a fact's raw `value` is in. `cents` is integer USD cents; `pct` is a percent number (6.5). */
export const FACT_UNITS = ["cents", "count", "pct", "ratio", "hours", "text", "date"] as const;
export const FactUnit = z.enum(FACT_UNITS);
export type FactUnit = z.infer<typeof FactUnit>;

/** The five glance-block metrics, each with its change vs last week (spec step 6). */
export const GLANCE_METRICS = ["revenue", "net", "marginPct", "orders", "onTimeRate"] as const;
export const GlanceMetric = z.enum(GLANCE_METRICS);
export type GlanceMetric = z.infer<typeof GlanceMetric>;

/** Thumbs on a non-market insight. Market watch items vote through `market.recommendations.vote`. */
export const FEEDBACK_VOTES = ["up", "down"] as const;
export const FeedbackVote = z.enum(FEEDBACK_VOTES);
export type FeedbackVote = z.infer<typeof FeedbackVote>;

/** Optional reason on thumbs down (spec copy `feedback.*`); feeds repeat suppression (AC12). */
export const FEEDBACK_REASONS = ["not_relevant", "wrong", "already_knew"] as const;
export const FeedbackReason = z.enum(FEEDBACK_REASONS);
export type FeedbackReason = z.infer<typeof FeedbackReason>;

export const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export const Weekday = z.enum(WEEKDAYS);
export type Weekday = z.infer<typeof Weekday>;

/** Whether a recipient's address can receive the digest email today (spec pipeline 12). */
export const RECIPIENT_DELIVERABILITY = ["ok", "unverified", "placeholder", "suppressed"] as const;
export const RecipientDeliverability = z.enum(RECIPIENT_DELIVERABILITY);
export type RecipientDeliverability = z.infer<typeof RecipientDeliverability>;

/**
 * Why an email was not sent (`sendUserEmail` skip reasons plus the digest's own `quiet_hours`).
 * Order is fixed and additive; the backend's `notify.ts` mirrors it.
 */
export const EMAIL_SKIP_REASONS = [
  "not_member",
  "unverified",
  "suppressed",
  "placeholder",
  "sample_workspace",
  "opted_out",
  "duplicate",
  "quiet_hours",
] as const;
export const EmailSkipReason = z.enum(EMAIL_SKIP_REASONS);
export type EmailSkipReason = z.infer<typeof EmailSkipReason>;

/**
 * One computed fact: a stable id (e.g. `net.thisWeek`, `d6.overdueCount`), the raw value in
 * `unit`, and the formatted strings in both languages (money as currency, sizes unrounded). The AI
 * summary may only reference facts by id; code substitutes `formatted`.
 */
export const DigestFact = z.object({
  id: z.string().min(1).max(64),
  unit: FactUnit,
  value: z.union([z.number(), z.string(), z.null()]),
  formatted: z.object({ en: z.string(), es: z.string() }),
});
export type DigestFact = z.infer<typeof DigestFact>;

/** One glance-block row: this week, last week, and the change (a fact so it formats in en/es). */
export const DigestGlanceItem = z.object({
  metric: GlanceMetric,
  current: DigestFact,
  previous: DigestFact.nullable(),
  /** Relative change vs last week as a percent number (15 = +15%); null when last week was zero or missing. */
  changePct: z.number().nullable(),
  change: DigestFact.nullable(),
});
export type DigestGlanceItem = z.infer<typeof DigestGlanceItem>;

/**
 * Placeholder values for the action copy. Keys match the spec's copy placeholders (`{{channel}}`,
 * `{{costLine}}`, `{{n}}`) except `design` -> `designName` and `blank` -> `blankName`, which follow
 * `RecommendationParams` so the two renderers share code. Ids let the app build the deep link.
 */
export const DigestActionParams = z.object({
  channel: z.enum(CHANNELS).optional(),
  connectionId: Id.optional(),
  costLine: z.string().optional(),
  designId: Id.optional(),
  designName: z.string().optional(),
  blankVariantId: Id.optional(),
  blankName: z.string().optional(),
  n: z.number().int().nonnegative().optional(),
});
export type DigestActionParams = z.infer<typeof DigestActionParams>;

/** The one fixed action of an insight. `href` is an in-app path (same origin), never a full URL. */
export const DigestAction = z.object({
  kind: DigestActionKind,
  params: DigestActionParams,
  href: z.string().regex(/^\/(?!\/)[^\\\s]*$/, "in-app path starting with /"),
});
export type DigestAction = z.infer<typeof DigestAction>;

/**
 * A ranked insight. `rank` is the position after ranking (1 = first shown); `score` is
 * impact x confidence x severity weight; `impactCents` is the estimated dollar impact when the
 * detector has one. `recommendation` is set only for `detector: "market"`; those items are voted
 * through `market.recommendations.vote` (one record, AC17), never through `digest.feedback`.
 * `myVote` is the caller's own thumbs; `clicked` whether the caller opened its action.
 */
export const DigestInsight = z.object({
  id: Id,
  detector: DigestDetector,
  rank: z.number().int().positive(),
  score: z.number().nonnegative(),
  confidence: Ratio,
  impactCents: Cents.nullable(),
  action: DigestAction,
  facts: z.array(DigestFact),
  /** Template key of the insight's headline (spec copy table), e.g. `D6 action`; never free text. */
  templateKey: z.string().min(1).max(64),
  recommendation: MarketRecommendation.nullable(),
  myVote: FeedbackVote.nullable(),
  clicked: z.boolean(),
});
export type DigestInsight = z.infer<typeof DigestInsight>;

/**
 * Plan usage for the glance block. Present on `digest.get` output only when the caller holds
 * `billing.read` (owner, admin); office never receives it (wave 19 fence). Optional, never null,
 * so its absence and its presence are the only two states.
 */
export const DigestPlanUsage = z.object({
  ordersUsed: z.number().int().nonnegative(),
  /** null = unlimited or custom plan. */
  ordersLimit: z.number().int().nonnegative().nullable(),
  aiCreditsRemaining: z.number().int(),
});
export type DigestPlanUsage = z.infer<typeof DigestPlanUsage>;

/** List row and Today card: enough for "Your week in review is ready: net $X (+Y%)". */
export const DigestSummary = z.object({
  id: Id,
  weekKey: WeekKey,
  weekStart: DateOnly,
  weekEnd: DateOnly,
  status: DigestStatus,
  narrativeStatus: NarrativeStatus,
  net: DigestFact.nullable(),
  netChange: DigestFact.nullable(),
  actionCount: z.number().int().nonnegative(),
  /** When the caller first opened it; null until then. */
  viewedAt: Timestamp.nullable(),
  readyAt: Timestamp.nullable(),
  createdAt: Timestamp,
});
export type DigestSummary = z.infer<typeof DigestSummary>;

/**
 * The full digest page. `steady` means no detector crossed a threshold (copy `steady`).
 * `incompleteOrders` > 0 shows copy `incomplete`; `partialChannels` shows copy `partial` per
 * channel (a D1 row exists for each). `marketWatch` holds at most 2 `detector: "market"` insights
 * shown below the actions; a market item promoted into `actions` (R1 with a gap or low blank, R3)
 * does not repeat in `marketWatch`.
 */
export const Digest = DigestSummary.extend({
  timezone: z.string(),
  steady: z.boolean(),
  incompleteOrders: z.number().int().nonnegative(),
  partialChannels: z.array(z.enum(CHANNELS)),
  glance: z.array(DigestGlanceItem),
  actions: z.array(DigestInsight).max(3),
  win: DigestInsight.nullable(),
  marketWatch: z.array(DigestInsight).max(2),
  planUsage: DigestPlanUsage.optional(),
});
export type Digest = z.infer<typeof Digest>;

/** `digest.latest`: the newest digest (any client status) and whether the shop is paused (spec step 7). */
export const DigestLatest = z.object({
  digest: DigestSummary.nullable(),
  /** Two `skipped_quiet` weeks in a row: the page shows copy `paused`. */
  paused: z.boolean(),
});
export type DigestLatest = z.infer<typeof DigestLatest>;

/** Thumbs on a non-market insight. `reason` is only meaningful with `down` and is rejected with `up`. */
export const DigestFeedbackInput = z
  .object({
    digestId: Id,
    insightId: Id,
    vote: FeedbackVote,
    reason: FeedbackReason.optional(),
  })
  .refine((v) => v.vote === "down" || v.reason === undefined, {
    message: "reason only goes with a thumbs down",
    path: ["reason"],
  });
export type DigestFeedbackInput = z.infer<typeof DigestFeedbackInput>;

export const DigestFeedback = z.object({
  digestId: Id,
  insightId: Id,
  vote: FeedbackVote,
  reason: FeedbackReason.nullable(),
  votedAt: Timestamp,
});
export type DigestFeedback = z.infer<typeof DigestFeedback>;

export const DigestClickInput = z.object({ digestId: Id, insightId: Id });
export type DigestClickInput = z.infer<typeof DigestClickInput>;

/** The stored click. `clickedAt` is the first click's time: a repeat returns the same row. */
export const DigestClick = z.object({
  digestId: Id,
  insightId: Id,
  clickedAt: Timestamp,
});
export type DigestClick = z.infer<typeof DigestClick>;

/** A member with `finance.read` and the state of their digest email (settings screen, AC4). */
export const DigestRecipient = z.object({
  userId: Id,
  name: z.string(),
  emailOn: z.boolean(),
  deliverable: RecipientDeliverability,
});
export type DigestRecipient = z.infer<typeof DigestRecipient>;

/**
 * Shop-level digest settings. `day` + `hour` are in the shop's `timezone` (from `me.updateOrg`);
 * the default is Monday 07:00, hour 6..10 (spec pipeline 1). `aiSummary` is the shop's own toggle;
 * `aiSummaryMode` is the global mode, read-only: while it is `shadow` or `off` the toggle is shown
 * disabled with copy `settings.aiSummaryShadow` (AC33) and the stored value has no effect.
 */
export const DigestSettings = z.object({
  enabled: z.boolean(),
  day: Weekday,
  hour: z.number().int().min(6).max(10),
  aiSummary: z.boolean(),
  aiSummaryMode: AiSummaryMode,
  timezone: z.string(),
  recipients: z.array(DigestRecipient),
  updatedAt: Timestamp.nullable(),
});
export type DigestSettings = z.infer<typeof DigestSettings>;

export const DigestSettingsInput = z.object({
  enabled: z.boolean().optional(),
  day: Weekday.optional(),
  hour: z.number().int().min(6).max(10).optional(),
  aiSummary: z.boolean().optional(),
});
export type DigestSettingsInput = z.infer<typeof DigestSettingsInput>;

/** An admin can turn a recipient's email off, never on (opt-in is the person's own, AC23). */
export const DigestRecipientEmailInput = z.object({
  userId: Id,
  on: z.literal(false),
});
export type DigestRecipientEmailInput = z.infer<typeof DigestRecipientEmailInput>;

/**
 * `digest.sendPreview`: one email of the latest digest to the caller only. `skipped` with a
 * reason is a normal answer (unverified address, sample workspace, placeholder); rate limiting is
 * the `RATE_LIMITED` error. Preview bypasses only the opt-in check (A8).
 */
export const DigestPreviewResult = z.object({
  weekKey: WeekKey,
  status: z.enum(["sent", "skipped"]),
  reason: EmailSkipReason.nullable(),
});
export type DigestPreviewResult = z.infer<typeof DigestPreviewResult>;
