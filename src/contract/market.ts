import { z } from "zod";
import { Id, Page, paginated } from "../schemas/common";
import {
  ConfidenceBand,
  DesignNiches,
  DesignNichesSetInput,
  MarketRecommendation,
  MarketRule,
  NicheTaxonomyEntry,
  RecommendationVote,
} from "../schemas/market";
import { base, proc } from "./_base";

/**
 * Market signals (wave 18, `specs/market-signals.md`). The four assistant tools
 * (`get_market_trend`, `get_seasonality`, `get_price_position`, `simulate_price`) stream through
 * `ai.assistant.ask`; this namespace is the small REST surface around them: the niche taxonomy
 * and a design's niches, and the recommendation feed with its votes. Everything is read-only
 * except the shop's own niche correction and its own vote. Nothing here writes a price, listing,
 * ad or PO (ADR 0014 fences). Implementer: backend-engineer (market), T-18-3.
 */

const niches = base.prefix("/niches").router({
  /** The fixed niche taxonomy (`product/market-niches.md`): keys, family and en/es labels. */
  taxonomy: proc("catalog.read")
    .route({ method: "GET", path: "/taxonomy" })
    .input(z.object({}))
    .output(z.object({ items: z.array(NicheTaxonomyEntry) })),
  /** A design's niches (0..2) and how it got them. Another shop's design id is NOT_FOUND. */
  get: proc("catalog.read")
    .route({ method: "GET", path: "/design" })
    .input(z.object({ designId: Id }))
    .output(DesignNiches),
  /**
   * Shop correction: replaces the design's niches (at most 2). An empty array clears the
   * correction and lets the mapper decide again. A correction is never overwritten by a re-run.
   * `market.niches.manage` so office and designer can fix a niche without `catalog.manage`.
   */
  set: proc("market.niches.manage")
    .route({ method: "PUT", path: "/design" })
    .input(DesignNichesSetInput)
    .output(DesignNiches)
    .errors({
      UNKNOWN_NICHE: {
        status: 400,
        message: "That niche is not in the list",
        data: z.object({ key: z.string() }),
      },
    }),
});

const recommendations = base.prefix("/recommendations").router({
  /**
   * The shop's stored recommendations, newest first. `ids` (at most 20) reloads the vote state of
   * the recommendations a stored assistant message carries (`AssistantMessage.recommendations`).
   * The service may compute an array; the router wraps it in the standard page.
   */
  list: proc("finance.read")
    .route({ method: "GET", path: "/" })
    .input(
      Page.extend({
        designId: Id.optional(),
        ids: z.array(Id).min(1).max(20).optional(),
        rule: z.array(MarketRule).optional(),
        /** Keep only this band or better (`medium` = high + medium). */
        minBand: ConfidenceBand.optional(),
      }),
    )
    .output(paginated(MarketRecommendation)),
  /**
   * The shop's one-tap answer. Idempotent: the same `{id, vote}` twice stores one vote, a different
   * vote replaces it (the latest wins), and the output returns the stored `vote` and `votedAt`.
   * An explicit vote always beats automatic adoption detection. Behind `finance.read` because it
   * records the caller's own opinion about the shop's numbers, nothing more.
   */
  vote: proc("finance.read")
    .route({ method: "POST", path: "/{id}/vote" })
    .input(z.object({ id: Id, vote: RecommendationVote }))
    .output(MarketRecommendation),
});

export const market = base.prefix("/market").tag("market").router({
  niches,
  recommendations,
});
