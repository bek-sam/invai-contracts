import { z } from "zod";
import { CHANNELS } from "../states";
import { Cents, DateOnly, Id, Ratio, Timestamp } from "./common";

/**
 * Market signals (wave 18, `specs/market-signals.md`, ADR 0014 fences, ADR 0015 global cache).
 *
 * Every number here is computed by code in `invai-backend/src/modules/market`; the assistant
 * only chooses, orders and phrases. Every outside fact carries `SignalProvenance` so the apps can
 * show source, date and the "Sample data" badge. Money is integer cents, confidence is a 0..1
 * ratio plus a band, dates are ISO strings.
 */

/**
 * Where a datum came from. Order is fixed and additive (new sources go at the end): the backend
 * mirrors this list in `src/integrations/market/types.ts` (research 14 §4.2).
 */
export const SIGNAL_SOURCES = [
  "own",
  "census",
  "google_trends",
  "pinterest_trends",
  "amazon_pricing",
  "amazon_brand_analytics",
  "walmart_pricing",
  "jungle_scout",
] as const;
export const SignalSource = z.enum(SIGNAL_SOURCES);
export type SignalSource = z.infer<typeof SignalSource>;

/** Under which terms we hold the datum. `first_party` is the shop's own data. */
export const LICENCES = ["first_party", "official_api", "public_dataset", "licensed"] as const;
export const Licence = z.enum(LICENCES);
export type Licence = z.infer<typeof Licence>;

/** high >= 0.70, medium 0.40..0.69, low < 0.40. Low never drives an action. */
export const CONFIDENCE_BANDS = ["high", "medium", "low"] as const;
export const ConfidenceBand = z.enum(CONFIDENCE_BANDS);
export type ConfidenceBand = z.infer<typeof ConfidenceBand>;

/** The five recommendation rules (spec step 5). Each has one fixed action; the copy lives in the apps. */
export const MARKET_RULES = ["R1", "R2", "R3", "R4", "R5"] as const;
export const MarketRule = z.enum(MARKET_RULES);
export type MarketRule = z.infer<typeof MarketRule>;

/** One fixed action per rule, in rule order. Apps render the wording from `rule` + `params`. */
export const MARKET_ACTIONS = [
  "list_and_stock", // R1 seasonal prep
  "price_test_up", // R2
  "raise_to_floor_or_stop_ads", // R3
  "new_designs_in_niche", // R4
  "pause_ads_and_deprioritize", // R5
] as const;
export const MarketAction = z.enum(MARKET_ACTIONS);
export type MarketAction = z.infer<typeof MarketAction>;

/** The shop's one-tap answer on a recommendation. The latest vote wins; voting twice stores one. */
export const RECOMMENDATION_VOTES = ["done", "not_useful"] as const;
export const RecommendationVote = z.enum(RECOMMENDATION_VOTES);
export type RecommendationVote = z.infer<typeof RecommendationVote>;

/** Where a recommendation was shown (spec step 7; the digest arrives in wave 19). */
export const RECOMMENDATION_SHOWN_IN = ["assistant", "digest"] as const;

/** Outcome label 28 days after adoption (difference-in-differences against the shop's other designs). */
export const RECOMMENDATION_OUTCOMES = [
  "improved",
  "worse",
  "inconclusive",
  "not_adopted",
] as const;

export const TREND_CLASSES = ["rising", "falling", "flat", "insufficient"] as const;
export const TrendClass = z.enum(TREND_CLASSES);
export type TrendClass = z.infer<typeof TrendClass>;

/** Why a trend reading is `insufficient` (spec step 3: < 13 points, or zero in > 50% of weeks). */
export const TREND_INSUFFICIENT_REASONS = ["too_few_points", "mostly_zero", "no_source"] as const;

/** Where a shop's price sits among comparables: low < P25, premium > P75. */
export const PRICE_BANDS = ["low", "market", "premium"] as const;
export const PriceBand = z.enum(PRICE_BANDS);
export type PriceBand = z.infer<typeof PriceBand>;

/** Machine-readable reason a price position can't be given (spec AC6, AC29). */
export const PRICE_POSITION_UNAVAILABLE_REASONS = [
  "no_compliant_source", // Etsy, TikTok, Shopify, or a mock source for a real shop in production
  "not_connected", // the channel has no live connection in this shop
  "too_few_comparables", // n < 8 after the comparable filter
] as const;

/** Competition density is only ever a tercile among the shop's own niches, never a number. */
export const COMPETITION_TERCILES = ["less_crowded", "typical", "crowded"] as const;

/** Which series the seasonality index came from (source priority in spec step 3). */
export const SEASONALITY_INDEX_SOURCES = ["own", "outside", "census_prior"] as const;

/** How a design got its niches. A shop `correction` always wins and survives re-runs. */
export const NICHE_ASSIGNMENT_SOURCES = ["stems", "model", "correction", "unclassified"] as const;

/**
 * A taxonomy key like `dog-mom` or `4th-of-july`. The key list itself lives in the backend data
 * file (`product/market-niches.md` -> `src/modules/market/niches.ts`), never here: the contract
 * only checks the shape, the backend answers `UNKNOWN_NICHE` for a key it doesn't know.
 */
export const NicheKey = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "kebab-case key");
export type NicheKey = z.infer<typeof NicheKey>;

/** Source, licence, dates and the mock flag on every outside fact. */
export const SignalProvenance = z.object({
  source: SignalSource,
  licence: Licence,
  /** The date the datum describes (week ending, month end, or the pull time for own data). */
  asOf: Timestamp,
  fetchedAt: Timestamp,
  /** From a mock provider: the apps show "Sample data" and the answer says so. */
  mock: z.boolean(),
});
export type SignalProvenance = z.infer<typeof SignalProvenance>;

/** The short form carried on assistant stream events (`AssistantEvent.tool_result.sources`). */
export const SignalSourceRef = z.object({
  source: SignalSource,
  asOf: Timestamp,
  mock: z.boolean(),
});
export type SignalSourceRef = z.infer<typeof SignalSourceRef>;

/** What a signal is about: a design (with its niches) or a niche alone. Flat, so no exhaustive switch. */
export const SignalSubject = z.object({
  designId: Id.nullable(),
  designName: z.string().nullable(),
  niche: NicheKey.nullable(),
});
export type SignalSubject = z.infer<typeof SignalSubject>;

/** Fields every computed signal shares. `stale` = older than 2x the source's TTL. */
const SignalBase = z.object({
  subject: SignalSubject,
  /** s * f * r * a in [0, 1] (spec step 4). */
  confidence: Ratio,
  band: ConfidenceBand,
  stale: z.boolean(),
  /** True when any contributing source is a mock. */
  mock: z.boolean(),
  sources: z.array(SignalProvenance),
  /** When the signal was computed. */
  asOf: Timestamp,
});

/** One source's trend reading. `growth4w` is a ratio (0.15 = +15% over 4 weeks), `yoy` likewise. */
export const TrendReading = z.object({
  provenance: SignalProvenance,
  trend: TrendClass,
  growth4w: z.number().nullable(),
  yoy: z.number().nullable(),
  /** Weekly points in the fit. */
  n: z.number().int().nonnegative(),
  insufficientReason: z.enum(TREND_INSUFFICIENT_REASONS).nullable(),
});
export type TrendReading = z.infer<typeof TrendReading>;

/** `get_market_trend`: own and outside readings side by side; disagreement is stated, never averaged. */
export const MarketTrend = SignalBase.extend({
  /** Overall class. `insufficient` when no reading has enough points. */
  trend: TrendClass,
  growth4w: z.number().nullable(),
  yoy: z.number().nullable(),
  /** Fit window in weeks: 26, or 13 for a young design. */
  windowWeeks: z.number().int().positive(),
  readings: z.array(TrendReading),
  /** Own data and outside interest point different ways (agreement factor a = 0.4). */
  disagreement: z.boolean(),
  insufficientReason: z.enum(TREND_INSUFFICIENT_REASONS).nullable(),
});
export type MarketTrend = z.infer<typeof MarketTrend>;

export const SeasonalityMonth = z.object({
  month: z.number().int().min(1).max(12),
  /** Month mean / all-month mean. Peak >= 1.3, off <= 0.8. */
  index: z.number().nonnegative(),
});

/** Weeks to the first peak minus the shop's lead time (median paid->shipped + 3 weeks listing ramp). */
export const ActBy = z.object({
  date: DateOnly,
  peakMonth: z.number().int().min(1).max(12),
  weeksToPeak: z.number().nonnegative(),
  leadTimeWeeks: z.number().nonnegative(),
  /** <= 2 weeks left and the peak is <= 10 weeks away. */
  actNow: z.boolean(),
});
export type ActBy = z.infer<typeof ActBy>;

/** `get_seasonality`. An empty `index` with `indexSource: null` means insufficient. */
export const MarketSeasonality = SignalBase.extend({
  index: z.array(SeasonalityMonth).max(12),
  peakMonths: z.array(z.number().int().min(1).max(12)),
  offMonths: z.array(z.number().int().min(1).max(12)),
  /** `census_prior` is "all US clothing stores", labelled so in the apps (copy `season.census`). */
  indexSource: z.enum(SEASONALITY_INDEX_SOURCES).nullable(),
  actBy: ActBy.nullable(),
  /** Full years behind the index. */
  yearsUsed: z.number().int().nonnegative(),
});
export type MarketSeasonality = z.infer<typeof MarketSeasonality>;

const PricePositionBase = SignalBase.extend({
  channel: z.enum(CHANNELS),
  currentPriceCents: Cents.nullable(),
  /** Comparables after the filter (spec step 2.5). Minimum 8 for an answer. */
  n: z.number().int().nonnegative(),
});

/**
 * `get_price_position`. `available: false` is a normal answer, not an error: no compliant source
 * for the channel (Etsy, TikTok, Shopify, or a mock for a real shop in production), the channel
 * isn't connected, or too few comparables. The apps render `unavailable.price` from `reason`.
 */
export const PricePosition = z.discriminatedUnion("available", [
  PricePositionBase.extend({
    available: z.literal(true),
    /** (#below + 0.5 * #equal) / n. */
    percentile: Ratio,
    priceBand: PriceBand,
    q1Cents: Cents,
    medianCents: Cents,
    q3Cents: Cents,
    featuredPriceCents: Cents.nullable(),
    /** Amazon only; a tercile among the shop's niches, never an absolute count. */
    density: z.enum(COMPETITION_TERCILES).nullable(),
  }),
  PricePositionBase.extend({
    available: z.literal(false),
    reason: z.enum(PRICE_POSITION_UNAVAILABLE_REASONS),
  }),
]);
export type PricePosition = z.infer<typeof PricePosition>;

/** Where a candidate price in the simulation came from. */
export const PRICE_CANDIDATE_ORIGINS = [
  "current",
  "minus_10",
  "minus_5",
  "plus_5",
  "plus_10",
  "comparable_q1",
  "comparable_median",
  "comparable_q3",
  "requested",
] as const;

export const PriceCandidate = z.object({
  priceCents: Cents,
  origin: z.enum(PRICE_CANDIDATE_ORIGINS),
  /** net(p) = p + shipping charged - fees(p) - unit cost - ads per unit - refundRate * p. */
  netPerUnitCents: Cents,
  marginPct: z.number(),
  /** Only with a price-response estimate; otherwise null ("volume effect unknown"). */
  estimatedWeeklyUnits: z.number().nonnegative().nullable(),
  estimatedWeeklyNetCents: Cents.nullable(),
});
export type PriceCandidate = z.infer<typeof PriceCandidate>;

/** Trailing-90-day cost lines the simulation used, so the answer can show its arithmetic. */
export const PriceCostBasis = z.object({
  unitCostCents: Cents.nullable(),
  shippingChargedCents: Cents.nullable(),
  adsPerUnitCents: Cents.nullable(),
  refundRate: Ratio.nullable(),
  /** Channel fee model at the time: percent of price plus a fixed part. */
  feePct: z.number().nullable(),
  feeFixedCents: Cents.nullable(),
  periodDays: z.number().int().positive(),
});

/** Which cost lines were missing when `incomplete` is true. */
export const PRICE_COST_LINES = ["unit_cost", "fees", "shipping", "ads", "refunds"] as const;

/** Arc elasticity clamped to [-4, 0]; only with >= 2 own price points of >= 30 units each. */
export const PriceResponseEstimate = z.object({
  elasticity: z.number().min(-4).max(0),
  pricePointsUsed: z.number().int().min(2),
});

/** `simulate_price`. Always available from own data; `incomplete` when cost lines are missing. */
export const PriceSimulation = SignalBase.extend({
  channel: z.enum(CHANNELS),
  currentPriceCents: Cents.nullable(),
  costBasis: PriceCostBasis,
  /** Candidate prices, rounded to the shop's current ending (.99 or .00). At most 20 rows. */
  candidates: z.array(PriceCandidate).max(20),
  breakEvenCents: Cents.nullable(),
  /** Lowest price on a 5-cent grid with margin >= `floorMarginPct`. */
  floorPriceCents: Cents.nullable(),
  floorMarginPct: z.number(),
  /** null means "volume effect unknown". */
  priceResponse: PriceResponseEstimate.nullable(),
  incomplete: z.boolean(),
  missing: z.array(z.enum(PRICE_COST_LINES)),
});
export type PriceSimulation = z.infer<typeof PriceSimulation>;

/**
 * Fixed parameters for the rule's action copy (spec "Copy": R1..R5 action). All optional so a rule
 * fills only what it uses; no free text except trademark-screened R4 `ideas`.
 */
export const RecommendationParams = z.object({
  designName: z.string().optional(),
  /** R1: connected channels where the design is missing. */
  channels: z.array(z.enum(CHANNELS)).optional(),
  /** R2: the channel of the price test. */
  channel: z.enum(CHANNELS).optional(),
  blankVariantId: Id.optional(),
  blankName: z.string().optional(),
  /** R1: the blank is below its reorder point (link to the reorder screen). */
  blankBelowReorderPoint: z.boolean().optional(),
  peakMonth: z.number().int().min(1).max(12).optional(),
  actByDate: DateOnly.optional(),
  /** R1: last year's peak units x (1 + yoy); null when last year is missing. */
  expectedUnits: z.number().int().nonnegative().nullable().optional(),
  currentPriceCents: Cents.optional(),
  /** R2: the suggested test range (p0 x 1.05 .. 1.10, capped at the comparables' median). */
  testPriceMinCents: Cents.optional(),
  testPriceMaxCents: Cents.optional(),
  comparableMedianCents: Cents.optional(),
  /** R3: the floor price (margin >= 15%). */
  floorPriceCents: Cents.optional(),
  marginPct: z.number().optional(),
  niche: NicheKey.optional(),
  /** R4: 1-2 design ideas, each passed through the trademark screen. Never another seller's work. */
  ideas: z.array(z.string().max(120)).max(2).optional(),
});
export type RecommendationParams = z.infer<typeof RecommendationParams>;

/** What a recommendation points at. */
export const RecommendationTarget = z.object({
  designId: Id.nullable(),
  designName: z.string().nullable(),
  niche: NicheKey.nullable(),
  channel: z.enum(CHANNELS).nullable(),
});

/**
 * A stored recommendation (spec step 7): the rule, its fixed action and params, the confidence
 * at the time, the sources it rested on, where it was shown, the shop's vote and the outcome.
 * `vote` is the shop's word and always wins over automatic adoption detection.
 */
export const MarketRecommendation = z.object({
  id: Id,
  rule: MarketRule,
  action: MarketAction,
  target: RecommendationTarget,
  params: RecommendationParams,
  confidence: Ratio,
  band: ConfidenceBand,
  /** Built on at least one mock source. The apps show "Sample data" and the text says so. */
  mock: z.boolean(),
  sources: z.array(SignalProvenance),
  /** Signal rows behind it, for the answer's "why". */
  evidenceSignalIds: z.array(Id),
  /** Older than 2x the slowest source's TTL. */
  stale: z.boolean(),
  shownIn: z.enum(RECOMMENDATION_SHOWN_IN).nullable(),
  shownAt: Timestamp.nullable(),
  vote: RecommendationVote.nullable(),
  votedAt: Timestamp.nullable(),
  adoptedAt: Timestamp.nullable(),
  outcome: z.enum(RECOMMENDATION_OUTCOMES).nullable(),
  createdAt: Timestamp,
});
export type MarketRecommendation = z.infer<typeof MarketRecommendation>;

/**
 * The short form carried on `AssistantEvent.tool_result.recommendations` and
 * `AssistantMessage.recommendations`: enough for a vote card; the web reloads the rest with
 * `market.recommendations.list({ ids })`.
 */
export const RecommendationRef = z.object({
  id: Id,
  rule: MarketRule,
  band: ConfidenceBand,
  mock: z.boolean(),
});
export type RecommendationRef = z.infer<typeof RecommendationRef>;

/** One taxonomy row as the apps need it (keys + labels). Queries and stems stay in the backend. */
export const NicheTaxonomyEntry = z.object({
  key: NicheKey,
  family: z.string(),
  labelEn: z.string(),
  labelEs: z.string(),
  /** 1..12; empty for evergreen niches. */
  peakMonths: z.array(z.number().int().min(1).max(12)),
});
export type NicheTaxonomyEntry = z.infer<typeof NicheTaxonomyEntry>;

/** A design's niches: at most 2, or none (`unclassified`). */
export const DesignNiches = z.object({
  designId: Id,
  niches: z.array(NicheKey).max(2),
  source: z.enum(NICHE_ASSIGNMENT_SOURCES),
  /** The model's confidence when `source` is `model`; null otherwise. */
  confidence: Ratio.nullable(),
  updatedAt: Timestamp.nullable(),
});
export type DesignNiches = z.infer<typeof DesignNiches>;

/**
 * Shop correction of a design's niches (owner, admin, office, designer). At most 2 keys, each a
 * non-empty kebab-case string the backend checks against the taxonomy; an empty array clears the
 * correction, so the nightly mapper decides again.
 */
export const DesignNichesSetInput = z.object({
  designId: Id,
  niches: z
    .array(NicheKey)
    .max(2)
    .refine((v) => new Set(v).size === v.length, "niches must be distinct"),
});
export type DesignNichesSetInput = z.infer<typeof DesignNichesSetInput>;
