# invai-contracts

The single source of truth shared by every InvAI repo:

- **API contract** (`src/contract.ts`): oRPC procedures. `invai-backend` implements them; `invai-web` and `invai-floor` call them with full types. The same contract generates the public REST/OpenAPI API later.
- **Schemas** (`src/schemas/*`): Zod v4 schemas for catalog, orders, production, inventory and shipping.
- **Order item states** (`src/states.ts`): the production state machine.
- **Events** (`src/events.ts`): outbox event names and payloads used by the backend and its workers.

## Rules

- A breaking change here is a breaking change everywhere. Bump the minor version while on 0.x and update consumers in the same day.
- No runtime code beyond schemas and constants. No database, no HTTP.

## Local development

Other repos depend on this one through `"@invai/contracts": "link:../invai-contracts"`, so edits show up immediately. When CI publishing is set up, switch consumers to a version range from GitHub Packages.

```
pnpm install
pnpm typecheck
```
