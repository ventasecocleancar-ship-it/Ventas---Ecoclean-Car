# EcoClean Car

Software de ventas, operación y control de caja para una empresa de lavado de autos ecológico.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/ecoclean-car` — web portal, landing page, demo view and Clerk-ready access screens
- `artifacts/api-server/src/routes/ecoclean.ts` — API routes for dashboard, services, orders, payments and audit
- `lib/api-spec/openapi.yaml` — source of truth for API contracts
- `lib/db/src/schema/ecoclean.ts` — PostgreSQL schema for services, orders and audit events
- `artifacts/ecoclean-car/src/App.tsx` — portal routes and operational UI

## Architecture decisions

- Orders are append-only from the operator's perspective: status changes and edits create audit events instead of deleting the original order.
- The public landing page remains accessible without a session; operational routes use Clerk sessions in production.
- User lifecycle is administrator-controlled: the first Clerk account bootstraps as `ADMIN`, collaborators are invited with a role, and deleting access never deletes operational history.
- Development preview supports an explicitly labeled demo path so the owner can review the portal before inviting the supervisor.
- Prices are copied onto each order at intake, preserving the historical sale value even if the service catalog changes later.
- Services have separate prices for small, medium, and large vehicles; removing a service pauses it for future orders without deleting it or changing past orders.
- Order operations are tracked as Entrada, En puente, and Servicio finalizado; payments are recorded at the counter with cash, debit, or credit rather than charged online.
- SII readiness is represented in the settings surface, while live electronic document emission remains a separate integration step.

## Product

- Owner dashboard with sales, pending payments, ready vehicles, delivered vehicles and cash by payment method.
- Vehicle intake with automatic service pricing and EC order numbers.
- Full lifecycle from `INGRESADO` to `ENTREGADO`, payment recording and ticket/barcode presentation.
- Service catalog, order search and filters, customer edits, and security audit timeline.
- Role framing for administrator and branch supervisor, with Clerk-ready sign-in pages.
- Administrator-controlled collaborator invitations and account removal through the settings surface.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Run API codegen after changing `lib/api-spec/openapi.yaml` before editing consumers.
- Run `pnpm --filter @workspace/db run push` after changing the Drizzle schema in development.
- The demo route is for review only; production writes require an authenticated Clerk session.
- User management uses Clerk invitations and metadata; no EcoClean table stores passwords or private credentials.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
