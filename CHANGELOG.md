# Changelog

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
