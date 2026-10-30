# Production Readiness Checklist

## Purpose

This checklist is the minimal enterprise gate for shipping the Elbaraka app beyond prototype use. The goal is to prove the app works end-to-end before it is trusted for live business transactions.

## Required file mapping

### 1) Auth, session, and workspace access

- [src/app/login/page.tsx](../src/app/login/page.tsx) — verify login flow and redirect safety
- [src/app/staff/[[...slug]]/page.tsx](../src/app/staff/[[...slug]]/page.tsx) — verify access routing and login redirect behavior
- [src/lib/auth/identity.ts](../src/lib/auth/identity.ts) — verify active workspace membership enforcement
- [src/lib/supabase/server.ts](../src/lib/supabase/server.ts) — validate server-side client setup and cookie handling
- [src/lib/supabase/middleware.ts](../src/lib/supabase/middleware.ts) — verify session refresh and redirect logic
- [middleware.ts](../middleware.ts) — ensure route protection matches intended public/private boundaries

Checklist:
- [ ] login redirects only to approved destinations
- [ ] unauthenticated users are redirected away from protected staff routes
- [ ] role access is denied if the user has no active workspace membership
- [ ] `manager`, `purchasing`, and `delivery` roles are validated server-side
- [ ] no role selection in UI is accepted as authorization for live data access

### 2) Admin management and role changes

- [src/app/api/admin/users/route.ts](../src/app/api/admin/users/route.ts) — manager-only user and role management
- [src/lib/security.ts](../src/lib/security.ts) — centralized validation and rate limits

Checklist:
- [ ] manager-only endpoint remains restricted to active managers
- [ ] invite creation uses validated email and name input
- [ ] role changes reject invalid values and preserve at least one active manager
- [ ] repeated invite/update abuse is throttled
- [ ] error handling does not leak internal auth or database details

### 3) Customer invite validation and enrollment

- [src/app/api/customer/invites/validate/route.ts](../src/app/api/customer/invites/validate/route.ts) — invite validation and signed cookie flow
- [src/app/auth/customer-confirm/route.ts](../src/app/auth/customer-confirm/route.ts) — confirmation and redemption callback
- [src/lib/customer/invites.ts](../src/lib/customer/invites.ts) — token hashing, email normalization, invite code validation
- [src/app/api/customer/enroll/route.ts](../src/app/api/customer/enroll/route.ts) — enrollment redemption and membership creation
- [src/lib/auth/customer.ts](../src/lib/auth/customer.ts) — verified customer user check

Checklist:
- [ ] invite code, email, and user identity are validated together
- [ ] cookie state is signed and verified before trust
- [ ] expired, invalid, or mismatched invites are rejected
- [ ] prior invite attempts are revoked or invalidated correctly
- [ ] existing-user and new-user flows are both safe and deterministic
- [ ] no customer enrollment path accepts arbitrary email or invite data without verification

### 4) Live data access and permissions

- [src/app/api/operations/overview/route.ts](../src/app/api/operations/overview/route.ts) — live operational summary
- [src/app/api/operations/orders/route.ts](../src/app/api/operations/orders/route.ts) — live order operations
- [src/app/api/operations/inventory/setup/route.ts](../src/app/api/operations/inventory/setup/route.ts) — inventory writes and review flow
- [src/app/api/operations/purchasing/route.ts](../src/app/api/operations/purchasing/route.ts) — purchasing access
- [src/lib/auth/identity.ts](../src/lib/auth/identity.ts) — shared workspace role gate

Checklist:
- [ ] every write route validates workspace membership first
- [ ] every stock-changing endpoint validates business rules before mutation
- [ ] negative stock and duplicate mutation edge cases are tested
- [ ] role and workspace scope are enforced by server-side queries, not UI logic
- [ ] preview/local asset data is never used in production branches

### 5) Secret, environment, and deployment controls

- [src/lib/supabase/config.ts](../src/lib/supabase/config.ts) — public config gate
- [src/lib/supabase/admin.ts](../src/lib/supabase/admin.ts) — server secret administration client
- [README.md](../README.md) — setup and operational cautions
- [docs/enterprise-workplan.md](./enterprise-workplan.md) — migration and cutover constraints
- [docs/security-diagnostic-plan.md](./security-diagnostic-plan.md) — detailed security review plan

Checklist:
- [ ] no service-role or secret token is shipped to browser code
- [ ] production environment variables are isolated by deployment target
- [ ] App URL and redirect callbacks match actual production domains
- [ ] mapbox token is restricted to public client-safe scope only
- [ ] migration and seed rules are enforced so demo data never reaches production

### 6) Business transaction integrity

- [src/lib/workspace.ts](../src/lib/workspace.ts) — preview domain model and access rules
- [src/lib/operations.ts](../src/lib/operations.ts) — operational calculations
- [src/app/api/operations/returns/route.ts](../src/app/api/operations/returns/route.ts) — return and credit logic
- [src/app/api/operations/invoices/route.ts](../src/app/api/operations/invoices/route.ts) — invoice flow

Checklist:
- [ ] invoice totals reconcile with real payment and adjustment records
- [ ] customer returns cannot release stock without approved process
- [ ] stock-affecting flows are atomic and replay-safe
- [ ] no local preview values are treated as tax, financial, or stock truth

## Release gate

The application is ready for broader production use only if all items are checked and evidence is captured for each section.

### Minimum evidence required

- login flow works for valid and invalid users
- no active membership means no staff access
- invite validation fails for invalid, expired, or mismatched email/value combinations
- admin user change flow keeps at least one active manager
- stock-changing logic is proven against insufficient-stock and duplicate-call scenarios
- env and secret settings are reviewed for staging and production separation
- migration history and database policy review are attached to the deploy record

## Final signoff standard

A release is approved only when:

- all critical auth paths are tested
- all live transactional routes are verified against role and workspace access
- inventory and financial flows are validated with real DB semantics
- the app remains isolated from demo data and preview-only assumptions
- operational logs, alerting, and rollback procedures are documented
