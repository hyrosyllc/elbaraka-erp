# Elbaraka Security Diagnostic Plan

## Purpose

This plan is designed to validate the project as a secure operational ERP and customer-ordering platform before production exposure. It covers environment configuration, authentication, authorization, server-side data access, invitation and enrollment flows, transaction safety, and deployment controls.

The project already documents a staged rollout and explicitly warns against treating preview data, demo rows, or browser-local simulated role access as production authorization. This plan converts that intent into an operational review checklist.

## Scope

Review all auth-sensitive, transactional, and data-sensitive surfaces across the app, especially:

- authentication and session handling
- workspace membership and role enforcement
- staff/admin APIs and manager invitation flows
- customer enrollment and invite validation
- server-side database access patterns
- business transaction routes that can create or modify stock, orders, invoices, and returns
- PWA and client-side session persistence
- Mapbox token usage and external integrations
- environment variables and secrets
- migration and RLS-control verification

## Required review surfaces

- [src/app/login/page.tsx](../src/app/login/page.tsx)
- [src/app/staff/[[...slug]]/page.tsx](../src/app/staff/[[...slug]]/page.tsx)
- [src/app/api/admin/users/route.ts](../src/app/api/admin/users/route.ts)
- [src/app/api/customer/enroll/route.ts](../src/app/api/customer/enroll/route.ts)
- [src/app/api/customer/invites/validate/route.ts](../src/app/api/customer/invites/validate/route.ts)
- [src/lib/auth/identity.ts](../src/lib/auth/identity.ts)
- [src/lib/auth/customer.ts](../src/lib/auth/customer.ts)
- [src/lib/supabase/server.ts](../src/lib/supabase/server.ts)
- [src/lib/supabase/admin.ts](../src/lib/supabase/admin.ts)
- [src/lib/supabase/browser.ts](../src/lib/supabase/browser.ts)
- [src/lib/supabase/middleware.ts](../src/lib/supabase/middleware.ts)
- [middleware.ts](../middleware.ts)
- [src/lib/customer/invites.ts](../src/lib/customer/invites.ts)
- [src/app/api/operations/overview/route.ts](../src/app/api/operations/overview/route.ts)
- [docs/enterprise-workplan.md](./enterprise-workplan.md)

## Diagnostic phases

### Phase 1: Threat model and asset inventory

1. Define the protected assets:
   - authenticated identities
   - workspace membership records
   - customer accounts and invitations
   - supplier and client records
   - stock balances and movement ledger
   - order, invoice, and payment data
   - secret and env configuration
2. Identify trust boundaries:
   - browser to server
   - server to Supabase
   - staff portal vs customer portal
   - preview localStorage state vs live database-backed state
3. Document the actors:
   - managers
   - purchasing staff
   - delivery staff
   - customer users
   - unauthenticated visitors
4. Confirm the business security assumptions:
   - live database-backed access is the authorization boundary
   - preview mode is not production authorization
   - legacy tables stay read-only and segregated

### Phase 2: Secrets, deployment, and environment review

1. Verify all required env variables are present and separated by intent:
   - public config for browser access
   - secret config for server-only admin calls
   - Mapbox public token only for client map rendering
   - no secret-scoped Mapbox token in browser or public config
2. Check for accidental leakage:
   - no service-role keys in frontend bundle
   - no debug logs that print auth or invitation payloads
   - no env values committed to source control
3. Review the production deployment profile:
   - HTTPS enforcement
   - correct `NEXT_PUBLIC_APP_URL`
   - proper redirect validation for auth callbacks
   - email invitation and password-reset configuration
4. Verify secret rotation policy:
   - rotate any leak if a prior secret was exposed in browser code or local config

### Phase 3: Identity, session, and auth review

1. Confirm Sign-in behavior:
   - login route only accepts valid email/password
   - session refresh and cookie handling are managed through Supabase SSR patterns
   - auth checks use server-side claims, not browser-local state
2. Validate session assumptions:
   - no authentication decisions rely on `localStorage`
   - auth and access data are resolved from server state and workspace membership table
3. Review callback and redirect handling:
   - `/auth/confirm` and `/auth/customer-confirm` must match the configured app URL and allowed redirect list
   - ensure no open redirect or token confusion
4. Evaluate whether auth flows are bound to the correct email and workspace membership.

### Phase 4: Authorization review for workspace access

1. Review the role model and check for privilege escalation:
   - manager access is required for user management and invite actions
   - `getWorkspaceIdentity()` restricts active roles to manager, purchasing, and delivery
   - all protected routes explicitly validate role and workspace membership
2. Check that authorization is server-side and not UI-driven.
3. Confirm the app denies access when:
   - no active membership exists
   - no valid auth session exists
   - manager-only endpoints are hit without manager role
   - requested page is outside the user’s role access list
4. Validate that `role` is not taken from browser-local preview state for live access decisions.

### Phase 5: API and route review

1. Examine every route under [src/app/api](../src/app/api) for:
   - earliest auth check
   - workspace identity validation
   - input size and type enforcement
   - parameter validation
   - correct HTTP status codes
   - safe errors without leaking internal details
2. Review for unsafe patterns:
   - accepting large request bodies without limits
   - using untrusted input to build SQL, RPC parameters, or identifiers
   - trusting client-supplied user IDs or workspace IDs
   - missing `force-dynamic` or no-store headers on auth-sensitive pages
3. Confirm admin-only server actions are not callable from browser code without a signed-in session.

### Phase 6: Customer invitation and enrollment review

1. Validate the invitation lifecycle:
   - code generation and hashing
   - invitation expiry and revocation semantics
   - binding to email and client membership
   - single-use or one-time redemption requirements
2. Check cookies used in invite validation for:
   - `httpOnly`
   - `secure` in production
   - `sameSite` policy
   - narrow path and lifecycle
3. Verify there is no acceptance of arbitrary invite codes without a verified user email and a valid server-side RPC check.
4. Confirm the redemption endpoint validates the authenticated user identity before linking the account.

### Phase 7: Database, RLS, and transactional integrity review

1. Validate that live DB access uses trusted server-side clients and role-scoped queries.
2. Check for any route that can mutate data without a workspace check or role check.
3. Review inventory/stock transaction logic for:
   - negative balance prevention
   - idempotent operations
   - stock reservation and release correctness
   - partial receipt handling
   - concurrent write safety
4. Verify business transactions are append-only or have approved reconciliation patterns where required.
5. Validate that legacy tables remain read-only and that demo data is not mixed into operational stock.

### Phase 8: External service and client integration review

1. Mapbox:
   - token is public scoped only
   - no secret token is accepted by the server
   - public token is used for tiles, not geocoding or upstream secret transport
2. Email and redirect integration:
   - confirm allowed redirect URLs
   - confirm invitation/reset flows are configured in Supabase and not broken by app URL mismatch
3. PWA support:
   - service worker and offline handling should not expose sensitive data or bypass auth

### Phase 9: Abuse resistance and operational controls

1. Add and validate rate-limiting for:
   - login
   - invite creation
   - invite validation
   - customer enrollment
   - password reset or email-code issuance
   - Use the shared Postgres-backed limiter migration for deployment-wide counters. Configure `RATE_LIMIT_TRUSTED_IP_HEADER` only for a proxy-sanitized IP header; public invite validation fails closed when no trusted client IP is available.
2. Review logs and auditing:
   - who invited users
   - who changed roles or memberships
   - who approved or changed stock-sensitive records
3. Confirm there is a rollback and incident-readiness plan for production auth and workspace access problems.

### Phase 10: Release gates and sign-off

Before production or broad rollout, require evidence for:

- authenticated user can access only allowed workspace pages
- unauthorized user is denied
- manager-only actions remain guarded by server-side checks
- no secret or service-role key is exposed to browser code
- invitation flow is single-use and email-bound
- stock-affecting transactions are validated and concurrency-safe
- legacy/demo data stays isolated from production stock and reconciliation
- environment is configured for HTTPS and proper redirect domains

## Evidence checklist

The following should be recorded and retained as proof before release:

- screenshot or log of working sign-in flow
- screenshot or test result for denied access on invalid workspace membership
- manager-invitation test with active and inactive accounts
- customer-invite validation and redeem flow test
- rate-limit or abuse test for repeated invite/login attempts
- inventory transaction test for insufficient stock or duplicate receive scenarios
- config diff showing no secret values in source control
- migration and database policy review summary

## Security audit notes

This project is intentionally structured to separate preview/demo flows from live database-backed workflows. That is a good design decision and reduces the chance of unilateral trust in browser state. The live auth and role checks rely on Supabase claims and `erp_workspace_memberships`, which is the right general pattern.

The biggest final-risk areas are not simple “leaky secret” bugs; they are operational and rollout risks:

- production data migration still incomplete
- customer invitation lifecycle still needs hard proof under real auth conditions
- role and transaction validation must be verified end-to-end with real DB policies
- abuse controls and auditing are still required before broad rollout

## Exit criteria

The diagnostic is complete only when the following are true:

- all auth routes are reviewed and protected
- workspace role checks are verified in live DB-backed routes
- invite enrollment flows are validated for expiration, email binding, and single-use semantics
- secret handling is confirmed
- Mapbox public token policy is confirmed
- stock-changing or financial routes are reviewed for concurrency and negative-balance protections
- production rollout gates are signed off by an owner
