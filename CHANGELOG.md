# Changelog

## 0.14.0

Artwork `purged` status (T-29-5, wave 29; S-56, B-293). Additive; minor bump per the 0.x rule.
`FLOOR_COMPAT_BASELINE` stays 0.3.0 (the floor never reads this status).

- **Added** `"purged"` (last) to `ITEM_ARTWORK_STATUSES` and `ItemArtworkSummary.status`: buyer text and
  art removed under the PII clocks; re-enter to print. Consumer breaks: the `counts` record in
  `personalization.artwork.list` is now exhaustive over `purged`; backend T-29-1 fixes it.

## 0.13.0

Account security (T-28-1, wave 28; Amazon DPP, ADR 0025). Additive only; minor bump per the 0.x
rule. No floor- or station-facing shape changes, so `FLOOR_COMPAT_BASELINE` stays 0.3.0.

- **Added** `COMMON_ERRORS.MFA_REQUIRED` (403, `data: { deadline: Timestamp | null }`). Implementer
  T-28-2 (backend guard); web T-28-4 routes it to the setup page and must not toast it.
- **Added** optional `Me.mfa { required, enabled, deadline }`.
- **Added** `AUTH_ERROR_CODES` (`ACCOUNT_LOCKED` 423, `PASSWORD_REUSED` 400,
  `MFA_DISABLE_NOT_ALLOWED` 403) and `AccountLockedBody` (Better Auth errors, not oRPC).

## 0.10.0

Digest D9..D13 and Today's action panel (T-A10, wave A2, B-176/B-177; spec
`specs/business-analytics-v2.md` Track E; rulings in `waves/A2/reviews/plan-architect.md`).
Additive only; minor bump per the 0.x rule. No floor- or station-facing shape changes, so
`FLOOR_COMPAT_BASELINE` stays at 0.3.0 (ADR 0012 §5).

- **Added** `DIGEST_DETECTORS` values `D9`..`D13` at the end (after `market`).
- **Added** six `DIGEST_ACTION_KINDS` at the end: `review_shipping_prices` (D9),
  `review_losing_orders` (D10), `review_dead_stock` and `restock_size_gap` (D11),
  `review_blank_cost` (D12), `see_break_even` (D13). Exhaustive switches on the kind break:
  `invai-web/src/components/digest/digest-copy.ts` (`digestActionText`).
- **Added** optional `DigestActionParams` fields `style`, `color`, `size`, `supplierId`,
  `supplierName`, `points` (signed pct points), `deltaCents` (signed integer cents). No buyer data.
- **Added** `today.actions` (`GET /today/actions`, `finance.read`, `auth: user`) returning
  `TodayActions` (at most 5 ranked `TodayAction`s; `generatedAt` null until the day's set is
  built) and `today.recordActionClick` (`POST /today/actions/clicks`, `finance.read`, first click
  wins, domain error `ACTION_NOT_FOUND` 404). Implementer: T-A9 (stubbed until then).
- **Changed (text only)** `ShippingMargin.shipmentsWithoutZone` doc: it counts labeled orders, the
  unit of every grouping's rows. Name and type unchanged.

## 0.9.0

Business analytics v2 (T-A2, wave A1, B-169; spec `specs/business-analytics-v2.md`). Additive
only. Version decision: minor bump per the 0.x rule (every addition bumps minor). No floor- or
station-facing shape changes, so `FLOOR_COMPAT_BASELINE` stays at 0.3.0 (ADR 0012 §5).

- **Added** the `analytics` namespace (`/analytics`, all `finance.read`, `auth: user`), eleven
  procedures: `unitEconomics`, `losingOrders`, `leakage`, `shippingMargin`, `profitBridge`,
  `breakEven`, `operations`, `inventoryHealth`, `supplierTrends`, `designLifecycle` (all `GET`)
  and `export` (`POST /analytics/export-csv`, same `{ key }` output as `finance.exportCsv`).
  Range reads take the shared `Period`; `inventoryHealth` takes `days`, `designLifecycle` an
  optional `asOf`. Domain error `PERIOD_INVALID` (400). Schemas in `src/schemas/analytics.ts`.
  Implementers: T-A3 (the six finance reads), T-A4 (`operations`), T-A5 (`inventoryHealth`,
  `supplierTrends`, `designLifecycle`, `export`); the backend carries a `stubRouter` until then.
- **Added** `CostSettings.fixedMonthlyCents` (`Cents.nonnegative().nullish()`), writable through
  `finance.costSettings.update` via `CostSettingsInput`. Persisted by T-A3.
- **Added** `Shipment.destZone` (int 1..9, nullish, output only): the carrier zone set at label
  time by T-A4; no address, ZIP or name is stored with it.
- **Added** five `AssistantEvent` `tool_call.name` values at the end: `get_unit_economics`,
  `explain_profit_change`, `get_operations_health`, `get_inventory_health`,
  `get_shipping_insights` (built in T-A8).

## 0.8.0

Contract additions for the P2 sweep (T-22-1, wave 22: B-25, B-32, B-35, B-102, B-162, B-164,
B-167). Additive only; minor bump per the 0.x rule. Floor-facing shapes (`QueueItem`,
`ScanResult`, `MISMATCH_REASONS`, `REPRINT_REASONS`) only gain optional fields and appended
values, so `FLOOR_COMPAT_BASELINE` stays at 0.3.0 (ADR 0012 §5, additive needs no window).

The release lands in three commits so each consumer's mirror can go first and every consumer's
typecheck and tests stay green at the wave 20 gate: (1) everything below except the two items
marked *gated*; (2) `REPRINT_REASONS` values, pushed with T-22-4's backend mirror; (3) the
TikTok fee value, pushed with T-22-5's `fees.test.ts` line. Same version for all three: none
of the gated items changes a floor-facing shape.

- **Added** `shipping.scanForms.create` (`POST /shipping/scan-forms/`, `shipping.manage`) →
  `ScanForm`, idempotent on (carrier, date); errors `NO_LABELS_TO_MANIFEST` (409),
  `SCAN_FORM_REJECTED` (502). `shipping.scanForms.list` (`GET`, `Page` + carrier/from/to) and
  `shipping.scanForms.get` (`GET /{id}`), both `shipping.read`. Implementer:
  integrations-engineer by grant into the shipping module (T-22-3).
- **Added** `shipping.verifyAddress` (`POST /shipping/verify-address`, `shipping.manage`):
  `{ orderId }` → `AddressVerification { status: verified|corrected|failed, suggestion, detail,
  verifiedAt }`; error `NO_SHIP_TO` (409). `failed` uses the existing `address_check` hold.
  Implementer: T-22-3.
- **Added** `Rate.expiresAt?: Timestamp` (rate TTL). Optional: a backend that doesn't compute it
  still typechecks; `shipping.buy` already has `RATE_EXPIRED`.
- **Added** `src/schemas/shipping.ts`: `SCAN_FORM_CARRIERS` (`usps, mock`), `ScanForm`,
  `ScanFormCreateInput`, `ADDRESS_VERIFICATION_STATUSES`, `AddressVerification`.
- **Added** `production.maintenance.start` / `.end` (`POST /production/maintenance/{start,end}`,
  new permission `production.maintenance`: owner, admin, office) and
  `production.maintenance.list` (`GET`, `production.read`, `auth: floor`, paginated). Start and
  end are idempotent by result shape (`MaintenanceStartResult.started`,
  `MaintenanceEndResult.ended`), never by error. Backed by a production-owned
  `station_maintenance_events` table (architect A3). Implementer: backend-engineer production
  (T-22-4).
- **Added** permission `production.maintenance` to `PERMISSIONS` and `OFFICE` (owner/admin via
  `SHOP_ALL`). `stations.manage` was the natural reuse but is owner/admin only (it issues station
  tokens), and the office lead must be able to close a press.
- **Added** `station_maintenance` at the end of `MISMATCH_REASONS`: a scan at a closed station
  is `ok: false`, `nextAction: "press"`, never a thrown error (architect A4). Consumers keyed on
  the enum (no typecheck break, label fallback until added): `invai-floor/src/i18n/{en,es}.ts`
  `floor.mismatch.station_maintenance`; `invai-web/src/routes/_app/production/stations.tsx`
  `mismatch.station_maintenance` (en/es).
- **Added** `src/schemas/production.ts`: `MAINTENANCE_REASONS` (`cleaning, calibration, repair,
  printer_maintenance, other`), `StationMaintenance`, `MaintenanceStartInput`,
  `MaintenanceStartResult`, `MaintenanceEndInput`, `MaintenanceEndResult`.
- **Added** to `QueueItem`: `blank.shelf?`, `blank.binCode?` (the blank's location, B-32; nested
  because `QueueItem.binCode` is the pack tote), `transferPrintedAt?`, `transferAgeDays?`,
  `transferAgeWarning?` (B-35). To `ScanResult`: `expected.shelf?`, `expected.binCode?`,
  `transferAgeDays?`, `transferAgeWarning?`. All optional until T-22-4 fills them.
- **Added** *gated (commit 2, with T-22-4)*: `under_cure` and `cracking` at the end of
  `REPRINT_REASONS` (research 10 §DTF; `peeling` maps to the existing `peel`). Breaks
  `invai-backend/src/modules/production/floor.ts` typecheck until the backend mirror
  `src/db/schema/production.ts` `REPRINT_REASONS` gains both values (type-only `enumText`, no
  migration). Labels: `invai-floor/src/i18n/{en,es}.ts` `floor.reason.*` (`ProblemDialog` lists
  every value), `invai-web/src/i18n/{en,es}.ts` `reprintReason.*`.
- **Added** `vendors.sheets.resendEmail` (`POST /vendors/sheets/{sheetId}/resend-email`,
  `vendors.manage`) → `{ sheetId, sentAt }`; errors `SHEET_NOT_SENT` (409),
  `VENDOR_USES_PORTAL` (409), `RESEND_TOO_SOON` (429, `{ retryAfterSec, lastSentAt }`; the
  backend sets the window, T-22-5 uses 10 minutes). Implementer: backend-engineer vendors (T-22-5).
- **Added** `me.updateOrg` input `shipsSaturday?` and `transferAgeWarnDays?` (1..365) and the
  same as optional fields on `Org`. `printsInHouse` was already settable there (B-162: only
  `shipsSaturday` was API-only). Implementer: backend-foundation (tenancy module, `updateOrg`
  service patch and `Org` mapping); no wave-22 card owns it, see the report.
- **Added** event `station.maintenance_changed` to `Events` (`{ stationId, maintenanceId, open,
  reason }`) and `RealtimeEvents` (`{ stationId, open }`). Web: `invai-web/src/lib/realtime.ts`
  `keysForEvent` needs a case (`default: []` until then). The floor never subscribes.
- **Changed** *gated (commit 3, with T-22-5)*: `CHANNEL_RULES.tiktok.fees.transactionPct` 8 → 6
  (B-164). Source: TikTok Shop US seller university, "Referral fees", knowledge_id
  5988482086864682, page updated 2026-05-14, fetched 2026-09-28: 6% for every menswear,
  womenswear and kids' fashion subcategory. Breaks `invai-backend/src/modules/finance/fees.test.ts`
  (asserts the stale 8) until T-22-5 updates it; `usesSchedule()` keeps working because a
  fresh `defaultFeeTable("tiktok")` equals the new default. Existing cost-settings rows seeded
  at 8 no longer match the default and fall to a flat 8% (T-22-5 to backfill).
- **Decided** ADR 0017 (B-167): `ListingContent.attributes` stays `Record<string, string>` at the
  API and in `listing_drafts.content`; the model's `{ key, value }[]` is the AI transport only,
  folded once in `ai/service.ts` `toContent`. No DB default migration needed. Doc comment added.
- Tests: `src/p2-sweep.test.ts` (routes, permissions, role matrix, schema round-trips, enum
  tails, events, version pin). `src/digest.test.ts` now asserts "at least 0.7.0".
- README: namespace rows, 244 procedures, permission-model paragraph.

## 0.7.0

The weekly business review digest (T-19-1, wave 19, `specs/weekly-digest.md`, ADR 0014 fences,
ADR 0016 link routes and preferences). Additive only; minor bump per the 0.x rule (new namespace,
as 0.6.0). Not floor-facing: `FLOOR_COMPAT_BASELINE` stays at 0.3.0 (the floor never reads
`digest.*`, `me.notifications.*` or `digest.ready`).

- **Added** namespace `digest` (`src/contract/digest.ts`, tag `digest`, prefix `/digest`), nine
  procedures, all `auth: user`. Implementer: backend-engineer (digest), T-19-3.
  - `digest.list` (`GET /digest/`, `finance.read`): `Page` → `paginated(DigestSummary)`, newest first.
  - `digest.get` (`GET /digest/week?weekKey`, `finance.read`): one week → `Digest`; `planUsage`
    present only for `billing.read`. The week key is a query param because GET path params are
    limited to ids (`contract.test.ts`).
  - `digest.latest` (`GET /digest/latest`, `finance.read`) → `{ digest: DigestSummary | null, paused }`.
  - `digest.feedback` (`POST /digest/{digestId}/feedback`, `finance.read`): idempotent on (digest,
    insight, caller), latest vote wins; error `MARKET_INSIGHT` (409) for `detector: "market"`.
  - `digest.recordClick` (`POST /digest/{digestId}/clicks`, `finance.read`): idempotent, first
    click wins.
  - `digest.settings.get` (`GET /digest/settings/`), `digest.settings.set` (`PATCH`, partial),
    `digest.settings.setRecipientEmail` (`POST /digest/settings/recipients/{userId}/email`, `on`
    is `false` by type): all `org.manage`.
  - `digest.sendPreview` (`POST /digest/preview`, `org.manage`) → `DigestPreviewResult`; error
    `NO_DIGEST` (409); rate limit is `RATE_LIMITED`.
- **Added** `me.notifications.get` (`GET /me/notifications/`) and `me.notifications.set`
  (`PUT /me/notifications/`), both `org.read`, keyed by `NOTIFICATION_KINDS = ["digest"]`.
  Implementer: backend-foundation, T-19-4. `src/modules/tenancy/router.ts` must implement the
  `notifications` key (`authed.me.router` requires every key).
- **Added** `src/schemas/digest.ts`: `WEEK_KEY_PATTERN`/`WeekKey` (`YYYY-Www`), `DIGEST_STATUSES`
  (`ready, skipped_quiet`; `building`/`failed` are DB-only), `NARRATIVE_STATUSES` (`none, shadow,
  ok, rejected, skipped_budget, skipped_off`), `AI_SUMMARY_MODES`, `DIGEST_DETECTORS` (`D1..D8,
  market`), `DIGEST_ACTION_KINDS`, `FACT_UNITS`, `GLANCE_METRICS`, `FEEDBACK_VOTES`,
  `FEEDBACK_REASONS` (`not_relevant, wrong, already_knew`), `WEEKDAYS`, `RECIPIENT_DELIVERABILITY`,
  `EMAIL_SKIP_REASONS`; schemas `DigestFact` (id, raw value, formatted en/es), `DigestGlanceItem`,
  `DigestActionParams`, `DigestAction` (in-app `href` only), `DigestInsight` (reuses
  `MarketRecommendation` for `detector: "market"`), `DigestPlanUsage`, `DigestSummary`, `Digest`
  (≤ 3 actions, 1 win, ≤ 2 Market watch items; **no narrative text field**), `DigestLatest`,
  `DigestFeedbackInput`/`DigestFeedback`, `DigestClickInput`/`DigestClick`, `DigestRecipient`,
  `DigestSettings`/`DigestSettingsInput` (day `mon..sun`, hour 6..10), `DigestRecipientEmailInput`,
  `DigestPreviewResult`.
- **Added** to `src/schemas/tenancy.ts`: `NOTIFICATION_KINDS`, `NOTIFICATION_PREFERENCE_SOURCES`
  (`settings, unsubscribe_link, admin`), `NotificationPreference`, `NotificationPreferences`,
  `NotificationPreferenceSetInput`.
- **Added** event `digest.ready` `{ digestId, weekKey }` to both `Events` and `RealtimeEvents`
  (the envelope carries the org). Consumer file keyed on realtime names:
  `invai-web/src/lib/realtime.ts` `keysForEvent` (T-19-5 adds the case; `default: []` until then).
- **Added** `digest_narrative` at the end of `CREDIT_KINDS` (backend mirror
  `invai-backend/src/db/schema/ai.ts`, T-19-2's grant).
- **Added** `ai_summary_breaker` at the end of `ALERT_KINDS` (wave.md grant for T-19-2 AC22).
  **Breaks** `invai-web/src/routes/_app/index.tsx` `alertKindLabel` (exhaustive switch over
  `Alert["kind"]`, TS2366) until web-engineer adds the case and `alerts.kind.ai_summary_breaker`
  in `src/i18n/en.ts` and `es.ts`. Same-day fix, tech lead to grant.
- No new permission. Tests: `src/digest.test.ts` (matrix, routes, pagination, schema round-trips,
  event, enum tails, version). `src/market.test.ts` now asserts "at least 0.6.1" instead of the
  exact version, so the newest wave's test is the only one pinning `CONTRACT_VERSION`.
- README: `digest` and `privacy` rows, `me.notifications` in the `me` row, digest permissions in
  the permission model, and a "Public link routes (not oRPC)" section pinning `/l/:token`.

## 0.6.1

Follow-up to T-18-1. Additive only; not floor-facing (`FLOOR_COMPAT_BASELINE` stays at 0.3.0).

- **Added** `market_niche` to `CREDIT_KINDS` (`src/schemas/ai.ts`, end of the enum), so the AI
  credit ledger can record niche-assignment usage once the backend's `CREDIT_KINDS` mirror
  picks it up (backend follow-up, ai-engineer's grant, not this repo's).
- README: `market` row added to the namespace table (195 procedures) and `market.niches.manage`
  added to the permission-model example list (both were missed in 0.6.0).

## 0.6.0

Market signals for the assistant (T-18-1, wave 18, `specs/market-signals.md`, ADR 0014 fences,
ADR 0015 global demand cache). Additive only; minor bump per the 0.x rule. Not floor-facing:
`FLOOR_COMPAT_BASELINE` stays at 0.3.0 (the floor never reads `AssistantEvent` or `market.*`).

- **Added** namespace `market` (`src/contract/market.ts`, tag `market`, prefix `/market`), five
  procedures, all `auth: user`:
  - `market.niches.taxonomy` (`GET /market/niches/taxonomy`, `catalog.read`): the fixed niche
    list with en/es labels.
  - `market.niches.get` (`GET /market/niches/design?designId`, `catalog.read`): a design's 0..2
    niches and how it got them.
  - `market.niches.set` (`PUT /market/niches/design`, **new** `market.niches.manage`): shop
    correction, at most 2 distinct kebab-case keys, empty array clears; error `UNKNOWN_NICHE`.
  - `market.recommendations.list` (`GET /market/recommendations/`, `finance.read`): cursor
    paginated (`Page` + `designId?`, `ids?` 1..20, `rule?`, `minBand?`) →
    `paginated(MarketRecommendation)`.
  - `market.recommendations.vote` (`POST /market/recommendations/{id}/vote`, `finance.read`):
    idempotent; the same `{id, vote}` twice stores one vote, the latest vote wins, the output
    returns the stored `vote` and `votedAt`.
- **Added** `src/schemas/market.ts`: `SIGNAL_SOURCES`/`SignalSource` (`own, census,
  google_trends, pinterest_trends, amazon_pricing, amazon_brand_analytics, walmart_pricing,
  jungle_scout`), `LICENCES`/`Licence` (`first_party, official_api, public_dataset, licensed`),
  `CONFIDENCE_BANDS`/`ConfidenceBand`, `MARKET_RULES`/`MarketRule` (`R1..R5`),
  `MARKET_ACTIONS`/`MarketAction`, `RECOMMENDATION_VOTES`/`RecommendationVote` (`done,
  not_useful`), `RECOMMENDATION_SHOWN_IN`, `RECOMMENDATION_OUTCOMES`, `TREND_CLASSES`/
  `TrendClass`, `TREND_INSUFFICIENT_REASONS`, `PRICE_BANDS`/`PriceBand`,
  `PRICE_POSITION_UNAVAILABLE_REASONS` (`no_compliant_source, not_connected,
  too_few_comparables`), `COMPETITION_TERCILES`, `SEASONALITY_INDEX_SOURCES`,
  `NICHE_ASSIGNMENT_SOURCES`, `PRICE_CANDIDATE_ORIGINS`, `PRICE_COST_LINES`; schemas `NicheKey`,
  `SignalProvenance`, `SignalSourceRef`, `SignalSubject`, `TrendReading`, `MarketTrend`,
  `SeasonalityMonth`, `ActBy`, `MarketSeasonality`, `PricePosition` (discriminated on
  `available`; `false` carries `reason` + `n`), `PriceCandidate`, `PriceCostBasis`,
  `PriceResponseEstimate`, `PriceSimulation`, `RecommendationParams`, `RecommendationTarget`,
  `MarketRecommendation`, `RecommendationRef`, `NicheTaxonomyEntry`, `DesignNiches`,
  `DesignNichesSetInput`. Money is integer cents, confidence a 0..1 `Ratio` plus a band, dates
  ISO strings, every outside fact carries `SignalProvenance` with `mock`.
- **Added** permission `market.niches.manage` (end of `PERMISSIONS`; owner and admin through
  `SHOP_ALL`, plus `OFFICE` and `DESIGNER`). Presser, packer, receiver and vendor hold none of the
  market permissions.
- **Added** four values at the end of `AssistantEvent.tool_call.name`: `get_market_trend`,
  `get_seasonality`, `get_price_position`, `simulate_price` (built in T-18-4). Consumer files
  that key on tool names: `invai-web/src/i18n/en.ts` and `es.ts` (`assistant.tool.*` labels;
  the route falls back to the raw name, so this is a copy gap, not a type break).
- **Added** optional fields on `AssistantEvent.tool_result`: `mock?`, `sources?:
  SignalSourceRef[]`, `recommendations?: RecommendationRef[]` (max 3). No new union member.
- **Added** optional `AssistantMessage.recommendations?: RecommendationRef[]` and `mock?`.
- Tests: `src/market.test.ts` (permission matrix from `roles.ts`, pagination, schema
  round-trips, event additivity, version) and a `roles.test.ts` case for the new permission.

## 0.5.0

Assistant analyst tool names (T-17-1, wave 17, `specs/assistant-business-analyst.md`). Not
floor-facing: `FLOOR_COMPAT_BASELINE` stays at 0.3.0 (the floor never reads `AssistantEvent`).

- **Added** five values to `AssistantEvent`'s `tool_call.name` enum (`src/schemas/ai.ts`), at the
  end, additive: `get_production_status`, `compare_periods`, `get_ad_performance`,
  `get_design_insights`, `get_fulfillment_health`. `get_production_status` already existed as a
  backend-only tool (T-13) that `invai-backend/src/modules/ai/service.ts` special-cased out of the
  stream because the contract didn't know it; that workaround can be removed once T-17-3 lands (it
  sits outside this card's owned paths). The other four are new analyst tools built in T-17-2.
- **Version decision: minor bump (0.4.0 -> 0.5.0), not patch.** No `T-13-2` version-check script
  exists yet (`invai-docs/waves/13/T-13-2.md` was planned but never built: no report, no
  `check:consumers` script, no CI step). Deciding by hand: this repo's convention (every prior
  entry in this file, breaking or not) has bumped the minor digit on every contract change while
  the package sits at 0.x, per the README rule "bump the minor version on 0.x". Standard semver
  also treats a backward-compatible enum addition as a feature addition (MINOR), never a fix
  (PATCH). A patch bump would be a mismatch either way, so minor is correct under both readings.
  This change is additive-only (new enum members appended, nothing removed or reordered) and
  needs no deprecation window.

## 0.4.0

Contract drift cleanup (T-13-3, B-104, B-110). Not floor-facing: `FLOOR_COMPAT_BASELINE` stays at 0.3.0.

- **Removed** `production.scanBatch` (ADR 0013): never had a caller in any repo, checked against
  full git history, not just current contents — the floor replays queued offline scans one at a
  time through `production.scan`. No deprecation window: nothing floor-facing ever used this shape,
  so nothing breaks by removing it outright.
- **Removed** the `listing.synced` outbox event (`src/events.ts`): never emitted (no channel has a
  live listing-sync API; publishing is bulk-upload CSV only, see wave 6 plan review) and never
  consumed.
- **Added** `Org.demoOwned` (B-110): the caller's own sample workspace
  (`companies.demoOwnerUserId IS NOT NULL`), as opposed to a shop merely flagged `demo` (the seeded
  Desert Bloom). `invai-web`'s demo detection reads this instead of the `slug === demo-${id}`
  heuristic.
- Verified `stock.changed` (realtime) is already published (`invai-backend/src/modules/
  inventory/ledger.ts`) and consumed (`invai-web/src/lib/realtime.ts`) — no change needed.
- Added an imaging contract test (`invai-backend/src/integrations/imaging/contract.test.ts`):
  generates each request Pydantic model's JSON Schema from the invai-imaging FastAPI app and
  diffs it against the matching Zod schema in `client.ts`, so a field added, removed, renamed or
  newly-required on either side fails a test instead of drifting silently.

## 0.3.0

- Added `CONTRACT_VERSION`, `CONTRACT_VERSION_HEADER` and version helpers (`src/compat.ts`) for the floor API version handshake (T-13-1, B-82, ADR 0012).
- Added `FLOOR_COMPAT_BASELINE` (0.3.0), the default floor minimum; raised by hand only for floor-facing breaking changes.
- Added `CLIENT_TOO_OLD` (HTTP 426, `data: { minVersion, current }`) to `COMMON_ERRORS`.

## 0.2.0

- Baseline before versioned changes were recorded.
