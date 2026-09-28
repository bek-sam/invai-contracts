import { z } from "zod";
import { Page, paginated } from "../schemas/common";
import {
  Digest,
  DigestClick,
  DigestClickInput,
  DigestFeedback,
  DigestFeedbackInput,
  DigestLatest,
  DigestPreviewResult,
  DigestRecipientEmailInput,
  DigestSettings,
  DigestSettingsInput,
  DigestSummary,
  WeekKey,
} from "../schemas/digest";
import { base, proc } from "./_base";

/**
 * The weekly business review digest (wave 19, `specs/weekly-digest.md`). Read procedures are
 * `finance.read` (owner, admin, office; recipients are chosen by permission, not role name).
 * Shop settings and the preview are `org.manage` (owner, admin; office is refused, AC27). Plan
 * usage rides on `digest.get` only for callers with `billing.read` (owner, admin). Everything is
 * `auth: user`; the floor never sees a digest. Per-person email opt-in lives in
 * `me.notifications.*` (tenancy), not here. Implementer: backend-engineer (digest), T-19-3.
 *
 * The public unsubscribe and click links (`/l/:token`) are plain HTTP routes outside oRPC,
 * built in T-19-4; see the README ("Public link routes").
 */

const settings = base.prefix("/settings").router({
  /**
   * Shop settings plus the recipients (members with `finance.read`) and whether each address can
   * receive mail. `aiSummaryMode` is the global mode so the web can disable the toggle in shadow.
   */
  get: proc("org.manage")
    .route({ method: "GET", path: "/" })
    .input(z.object({}))
    .output(DigestSettings),
  /**
   * Partial update. `aiSummary: true` is stored even while the global mode is `shadow` or `off`
   * (the web disables the toggle then); it takes effect only when the mode is `on`.
   */
  set: proc("org.manage")
    .route({ method: "PATCH", path: "/" })
    .input(DigestSettingsInput)
    .output(DigestSettings),
  /**
   * Turns one recipient's digest email off (`on` is `false` by type: an admin never opts someone
   * in, AC23). Recorded with preference source `admin`. Idempotent: off twice is off. A user who
   * isn't an active member of this shop is NOT_FOUND.
   */
  setRecipientEmail: proc("org.manage")
    .route({ method: "POST", path: "/recipients/{userId}/email" })
    .input(DigestRecipientEmailInput)
    .output(DigestSettings),
});

export const digest = base
  .prefix("/digest")
  .tag("digest")
  .router({
    /** Past weeks, newest first. Only `ready` and `skipped_quiet` rows are ever returned. */
    list: proc("finance.read")
      .route({ method: "GET", path: "/" })
      .input(Page)
      .output(paginated(DigestSummary)),
    /**
     * One week's digest. `weekKey` is a query param, not a path segment (GET path params are limited
     * to ids by `contract.test.ts`). Another shop's week, a week that is still building or failed,
     * and a week with no row are all NOT_FOUND. `planUsage` is present only for `billing.read`.
     * Reading it records `viewedAt` for the caller (first view wins).
     */
    get: proc("finance.read")
      .route({ method: "GET", path: "/week" })
      .input(z.object({ weekKey: WeekKey }))
      .output(Digest),
    /** The newest digest for the Today card, plus `paused` after two quiet weeks in a row. */
    latest: proc("finance.read")
      .route({ method: "GET", path: "/latest" })
      .input(z.object({}))
      .output(DigestLatest),
    /**
     * Thumbs on a non-market insight. Idempotent on (digest, insight, caller): the same vote twice
     * stores one row, a different vote or reason replaces it (the latest wins), and the output is
     * the stored row. A `detector: "market"` insight votes through `market.recommendations.vote`
     * instead (one record, AC17) and answers MARKET_INSIGHT here.
     */
    feedback: proc("finance.read")
      .route({ method: "POST", path: "/{digestId}/feedback" })
      .input(DigestFeedbackInput)
      .output(DigestFeedback)
      .errors({
        MARKET_INSIGHT: {
          status: 409,
          message: "Market watch items are rated with Done or Not useful",
        },
      }),
    /**
     * Records that the caller opened an insight's action. Idempotent on (digest, insight, caller):
     * the first click wins and every repeat returns the same `clickedAt`. Feeds
     * `digest_action_click_rate`; never blocks navigation (the web fires it and moves on).
     */
    recordClick: proc("finance.read")
      .route({ method: "POST", path: "/{digestId}/clicks" })
      .input(DigestClickInput)
      .output(DigestClick),
    settings,
    /**
     * Emails the latest digest to the caller only, bypassing nothing but the opt-in check (A8).
     * Rate limited per caller (60 s) with RATE_LIMITED; the web shows its existing retry message
     * (AC30). `skipped` with a reason is a normal answer (unverified, placeholder, sample workspace).
     */
    sendPreview: proc("org.manage")
      .route({ method: "POST", path: "/preview" })
      .input(z.object({}))
      .output(DigestPreviewResult)
      .errors({
        NO_DIGEST: {
          status: 409,
          message: "Nothing to preview yet: the first digest builds next week",
        },
      }),
  });
