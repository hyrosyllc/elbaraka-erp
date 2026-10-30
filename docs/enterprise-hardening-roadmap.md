# Elbaraka Enterprise Hardening & Architecture Roadmap

## Executive position

This application already has the right instincts: a live Supabase/Postgres model, server-side access control, workspace-aware roles, and a staged ERP architecture. The missing piece is converting this from a well-structured prototype into a production-grade enterprise system with hardened identity, transactional integrity, and operational observability.

The recommended strategy is not a rewrite for the sake of elegance. It is a controlled modernization using clear service boundaries, stronger invariant enforcement, and a deployment model that lets the business grow safely.

## Principles

1. Browser state is never trusted.
2. The database is the authority for authorization and operational truth.
3. Every stock-affecting workflow is atomic, idempotent, and auditable.
4. Preview, demo, and operational data are never mixed.
5. Role access is explicit, tested, and enforced at the server boundary.
6. Every major domain is modeled as a contract with clear ownership.

## Recommended architecture direction

### 1) Domain-first backend boundaries

Split the business into explicit domains, each with its own repository and transaction rules:

- Identity & access
- Catalog & recipe management
- Inventory & stock ledger
- Purchasing & receiving
- Production & lot genealogy
- Sales orders & reservations
- Delivery & dispatch
- Invoicing & payments
- Returns & claims
- Customer portal & membership

This is more maintainable than a single unstructured API layer and prevents cross-domain business logic from leaking into UI code.

### 2) Keep Next.js for the app shell, but enforce a strict server boundary

Keep Next.js as the front door, but treat it as an application shell rather than the core business logic owner.

- UI components should call typed API routes.
- API routes should validate input, auth, and role.
- Database functions should enforce transactional rules.
- No business-critical stock math should live in client components.

This matches the current project philosophy and should be formalized as engineering policy.

### 3) Make the database the source of truth for inventory and financial invariants

For stock operations, require:

- append-only movement ledger
- server-side recalculation of available stock
- optimistic or locking-safe reservation logic
- idempotency keys for duplicate submissions
- deep validation before any stock change is committed

This is the core enterprise requirement for the ERP.

## Specific technical improvements

### A. Identity and session hardening

Implement a stronger identity layer:

- centralized auth service abstraction
- role/permission resolution from signed-in claims + workspace memberships
- explicit permission matrix rather than ad hoc checks
- per-endpoint authorization contract
- consistent `401` vs `403` vs `409` semantics

Recommended policy: never derive auth from a client-side role selector or localStorage state.

### B. Authorization model improvement

Replace ad hoc checks with a permission matrix:

- manager
- purchasing
- delivery
- customer
- support/admin

Matrix should codify:

- page access
- route access
- mutation permission
- read scope by workspace/customer/client
- admin-only capabilities

The app already has the concept of workspace roles; it should evolve into a policy-driven model with explicit permission checks at the database-layer boundary.

### C. Inventory and stock ledger architecture

The current project clearly recognizes that stock must be derived from movement history rather than mutable totals. That is the correct architecture.

Implement stronger stock domain rules:

- location-aware inventory balances
- reservations separate from actual stock
- lot-trace and expiry aware reads
- transfer and receiving workflow with explicit approval states
- stock adjustments with witness/approval metadata
- time-based ledger snapshots for reconciliation

This should become a domain service with test coverage for edge cases and concurrency.

### D. Customer portal and invitation flow hardening

The current customer invite flow is promising but should be treated as production-sensitive.

Add:

- rate limiting on validation and redemption endpoints
- server-enforced expiry + single-use enforcement
- attempt logging and audit events
- per-client and per-email invalidation for reused invites
- explicit session invalidation or re-linking rules for changed emails
- fallback for existing customers without creating duplicate identities

### E. Operational observability

Before broad rollout, add:

- structured request logging
- correlation IDs for user and request
- audit log for critical actions
- metrics for failed login, invite abuse, stock shortages, stock adjustments, and invoice payments
- alert rules and incident runbooks

### F. Deployment and environment control

Use environment-specific deployment rules:

- dev, staging, production isolation
- separate Supabase projects or at least strictly separated schemas/tenants
- CI checks for migrations, env validation, and seeding prevention
- policy gates preventing seeded demo data in production

## Suggested implementation sequence

### Phase 0: Stabilize and protect

- remove unsafe assumptions from preview mode
- enforce strict env validation
- lock down secret handling
- confirm no service-role secret is present in public config or app bundle
- verify all live APIs require auth and workspace membership

### Phase 1: Identity and authorization hardening

- centralize permission checks
- add explicit denial tests for each role
- validate route-level access by user and workspace
- enforce RLS + trusted server route boundary

### Phase 2: Business transaction integrity

- implement idempotent order and invoice endpoints
- enforce stock reservation logic in database functions
- add partial receipt, return, and stock adjustment safeguards
- add concurrency tests and negative-balance prevention checks

### Phase 3: Customer and workflow maturity

- harden invite validation and redemption flows
- add notification and reset audit logs
- align customer-facing portal to server-side access policy

### Phase 4: Production operations readiness

- add monitoring and alerting
- add real smoke tests on critical flows
- define rollback strategy and operational ownership
- run migration dry runs and restore drills

## Recommended tooling upgrades

These are optional but reasonable enterprise additions if the project continues to scale:

- Zod or Valibot for strict API validation
- Pino or structured logger for request-level tracing
- OpenTelemetry for tracing and observability
- Better rate limiting middleware for auth-heavy endpoints
- transactional repository layer with explicit domain services
- database migration validation in CI

## Decision guidance

The project should not stay in a “dashboard with fake data” model. The correct direction is:

- the app shell stays in Next.js
- the business logic becomes strict server-side contracts
- the database remains the system of record
- role, inventory, and finance rules are enforced in a centralized domain model

This is the enterprise-level structure a senior engineering team would preserve while shipping safely.

## Final recommendation

Proceed with a measured refactor, not a full rewrite. The priority should be:

1. identity and authorization hardening
2. stock transaction safety and ledger integrity
3. customer invite lifecycle hardening
4. production observability and migration controls
5. only then expand feature scope or add new libraries

The current project is already stronger than many prototypes because it recognizes the difference between preview behavior and real operating truth. The next step is formalizing that distinction into enforceable enterprise standards.
