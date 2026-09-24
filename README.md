# invai-contracts

`@invai/contracts` is the single source of truth shared by every InvAI repo: the oRPC API
contract, the Zod schemas, the state machines, roles and permissions, outbox events,
realtime events and per-channel rules. `invai-backend` implements the contract with
`implement(contract)`; `invai-web` and `invai-floor` get a typed client from it.

```
pnpm install
pnpm typecheck && pnpm lint && pnpm test
```

Rules:

- No runtime code beyond schemas, constants and pure helpers. No database, no HTTP.
- Money is integer cents (USD). Timestamps are ISO strings with offset. IDs are UUIDs.
  Physical sizes are inches unless the name ends in `Px` or `Oz`. Ratios are 0..1, percents
  are named `*Pct`.
- One schema per entity (`Order`, `OrderItem`, `GangSheet`, ...). Inputs are `XInput`;
  partial updates are `XInput.partial().extend({ id })`.
- Every list procedure takes `Page` (`cursor`, `limit`) and returns `paginated(Item)`
  (`items`, `nextCursor`). Small fixed lists (locations, stations, vendors) return `{ items }`.
- A breaking change here is a breaking change everywhere. Bump the minor version on 0.x
  and update consumers the same day. Keep the contract backward compatible within a wave.

## Module map

| File | What it holds |
| --- | --- |
| `src/contract.ts` | Composes every namespace into `contract`; `listProcedures()` and `PROCEDURE_PERMISSIONS` |
| `src/contract/_base.ts` | `proc(permission, { auth })`, `ProcedureMeta`, `COMMON_ERRORS` |
| `src/contract/<domain>.ts` | Procedures per domain, one `base.prefix(...).router({...})` per namespace |
| `src/schemas/<domain>.ts` | Zod schemas and enums per domain |
| `src/states.ts` | `ORDER_ITEM_STATES`, `ITEM_TRANSITIONS`, `canTransition`, `deriveOrderStatus`, sheet / shipment / PO / listing-draft states, `CHANNELS`, `STATIONS` |
| `src/roles.ts` | `ROLES`, `PERMISSIONS`, `ROLE_PERMISSIONS`, `hasPermission` |
| `src/channels.ts` | `CHANNEL_RULES`: listing limits, fee defaults and ship-by rules per channel (defaults the shop edits), `CSV_FORMATS` |
| `src/events.ts` | Outbox `Events` (name -> payload schema) for the worker |
| `src/realtime.ts` | SSE `RealtimeEvents` for browsers and tablets, `REALTIME_SSE_PATH` |

Namespaces (190 procedures):

| Namespace | Domain file | Covers |
| --- | --- | --- |
| `me`, `team`, `locations`, `stations`, `floor`, `audit` | `tenancy` | current user + org, team management, PINs, station tokens, floor PIN login, audit log |
| `today` | `today` | the command-center summary |
| `alerts` | `alerts` | list, mark read |
| `orders`, `orderItems` | `orders` | Order Hub list/filters, hold/release/cancel, timeline, counts, channel performance; per-unit items, manual map, artwork override, flags |
| `channels`, `skuRules` | `channels` | connections, Shopify OAuth / CSV connect, sync, CSV import reports, health; SKU rules CRUD, unmapped SKUs, suggestions, bulk apply |
| `designs`, `blanks`, `products` | `catalog` | designs with placements and QA, blank variants + bulk import, products (design x blank style) |
| `files` | `files` | presigned upload, signed download |
| `personalization` | `personalization` | templates CRUD + preview, item artwork list/approve/edit/re-render |
| `production` | `production` | batch preview/build, jobs, sheets, station queue, scan, QC, reprints, bins |
| `vendors`, `vendorPortal` | `vendors` | shop-side vendor connections and sheet spec; vendor-side inbox and status updates |
| `inventory` | `inventory` | stock levels, movement ledger, adjust, count, reorder suggestions, purchase orders, suppliers, settings |
| `shipping` | `shipping` | ship queue, rates, buy, batch buy, batch label PDF, void, shipments, settings, tracking push |
| `finance` | `finance` | profit by dimension, order profit breakdown, cost settings, ad spend |
| `ai` | `ai` | listing drafts, validation, trademark check, streamed assistant, credits |
| `billing` | `billing` | plan, usage vs limits, change plan (Stripe stubbed) |

## How to add a procedure

1. Put the entity and input schemas in `src/schemas/<domain>.ts`. Reuse `Id`, `Cents`,
   `Timestamp`, `Page`, `paginated`, `Address` from `schemas/common.ts`. Export the schema and,
   for entities, `export type X = z.infer<typeof X>`.
2. Add the procedure in `src/contract/<domain>.ts` inside the namespace's router:

   ```ts
   hold: proc("orders.manage")
     .route({ method: "POST", path: "/{id}/hold" })
     .input(z.object({ id: Id, reason: z.enum(HOLD_REASONS) }))
     .output(OrderWithItems)
     .errors({ ALREADY_HELD: { status: 409, message: "Order is already on hold" } }),
   ```

   - `proc(permission, { auth?, audit? })` sets the meta. Use `auth: "floor"` when a tablet
     with a floor session may call it; `auth: "station"` for the station token only.
   - Every procedure needs `.route({ method, path })`. Path params (`{id}`) must be keys of
     the input. Collection routes use `path: "/"` (the prefix supplies the segment).
   - Lists take `Page.extend({ ...filters })` and return `paginated(Item)`.
   - Add domain errors with `.errors()`; `COMMON_ERRORS` (`UNAUTHORIZED`, `FORBIDDEN`,
     `NOT_FOUND`, `CONFLICT`, `INVALID_TRANSITION`, `PLAN_LIMIT_REACHED`, `RATE_LIMITED`,
     `UPSTREAM_FAILED`) are already on every procedure.
3. A new namespace: create `src/contract/<domain>.ts` with
   `base.prefix("/<path>").tag("<domain>").router({...})` and add it to `contract` in
   `src/contract.ts`. Export new schema files from `src/index.ts`.
4. If the change emits a new event, add it to `Events` (worker side) and, when a UI must
   refresh, to `RealtimeEvents`.
5. Run `pnpm typecheck && pnpm lint && pnpm test`. `src/contract.test.ts` checks that every
   procedure has a route, a known permission and unique method + path, and that lists paginate.

## The permission model

- Roles: `owner`, `admin`, `office`, `designer`, `presser`, `packer`, `receiver` in a shop
  org, `vendor` in a vendor org (`Org.type` is `shop` or `vendor`).
- Permissions are `<area>.<verb>` strings in `PERMISSIONS` (e.g. `orders.manage`,
  `production.scan`, `vendor_portal.update`). `ROLE_PERMISSIONS[role]` expands a role;
  `Me.permissions` returns the expanded list so the UI can hide what a user cannot do.
- Every procedure declares one permission in its meta (`proc("orders.read")`). The backend
  middleware reads `procedure['~orpc'].meta.permission` and throws `FORBIDDEN` with
  `{ permission }` when `ROLE_PERMISSIONS[role]` lacks it. `PROCEDURE_PERMISSIONS` (dotted
  path -> permission) is the same data as a plain map, for tests and docs.
- `permission: "none"` skips the permission check but not authentication:
  `me.get`, `me.switchOrg`, `floor.login`, `floor.logout`, `floor.staff`.
- Auth modes (`meta.auth`): `user` (default; Better Auth session), `floor` (user session or
  floor session), `station` (station token only), `public`.
  - Station tokens are issued by `stations.issueToken` and sent as `Authorization: Station <token>`.
  - `floor.login` (station token + 4-6 digit PIN) returns a floor session bearer token for
    the staff member who owns the PIN; the session carries that user's role and permissions.
- Vendor users only reach `vendorPortal.*`, `me.*`, `team.*`, `files.downloadUrl` and
  `alerts.*`; the backend additionally scopes sheet reads through `vendor_access`.
