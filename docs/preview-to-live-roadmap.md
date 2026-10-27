# Preview to Live Roadmap

Implementation status as of 2026-10-27. "Live in code" means the signed-in page reads/writes through Supabase APIs and database RPCs; it does not mean the migration has been applied to the hosted database or that the workflow has passed production acceptance. The unauthenticated staff preview remains local/demo data by design.

| Page | Status | Database | Remaining work |
| --- | --- | --- | --- |
| Overview | Live in signed-in code | `/api/operations/overview`; role-specific live counts, invoice totals and stock balances | production data setup and acceptance tests |
| Item catalog | Live in signed-in code | `inventory_items`; customer-facing catalog at `/admin/catalog` uses `erp_products`, `erp_product_sizes` | production category/SKU mapping and data setup |
| Inventory | Live in signed-in code | movements, lots, reservations, transfers, adjustments, balance views | production opening counts and acceptance tests |
| Recipes | Live in signed-in code | `inventory_recipes`, `inventory_recipe_components` | apply migration; production recipe setup |
| Purchasing | Live in signed-in code | purchase orders, receipts, suppliers | production master-data setup and acceptance tests |
| Production needs/orders | Live in signed-in code | `erp_production_orders`, recipes, inventory ledger | apply migration; confirm consumption policy and test |
| Clients | Live in signed-in code | `erp_clients`, customer invitation and membership tables | apply portal migration; verify email delivery |
| Sales orders | Live in signed-in code | `erp_sales_orders`, reservations, order events | apply migration and acceptance tests |
| Delivery notes | Live in signed-in code | `erp_delivery_notes`, inventory movements | apply migration and acceptance tests |
| Invoices and payments | Live in signed-in code | `erp_invoices`, `erp_payments`, document sequences | apply migration; confirm tax/legal requirements |
| Returns | Live in signed-in code | `erp_customer_returns`, inventory movements | apply migration and acceptance tests |
| Delivery map | Live in signed-in code | clients, orders, drivers, manager-only invoice balances | apply order/invoice migrations; Mapbox token and acceptance tests |
| Role access | Fixed policy in signed-in code | server-side role/membership checks; read-only policy display | staff account provisioning and authorization tests |
| Customer ordering portal | Implemented; database migration pending | customer memberships/invitations, product catalog and order RPC | apply migration, setup email delivery, finish catalog mapping and acceptance tests |

## Slice 1: sales order lifecycle and delivery map (implemented, migration pending)

Migration `20261028000100_sales_order_lifecycle.sql`:

- Manager creates a draft order (or receives one from the customer portal), then confirms it. Confirming reserves stock atomically from warehouse locations and fails with `insufficient_stock` rather than overselling.
- Cancelling releases reservations. Orders that have started delivery cannot be cancelled.
- Assigning a driver, requested date, priority and notes is allowed while the order is open.
- Every action writes an `erp_sales_order_events` row.

Application: live Orders page, live Delivery map page, role-filtered APIs, idempotent order creation.

## Slice 2: delivery, invoicing, returns (implemented; migrations pending)

- Delivery note from a confirmed order; dispatch writes `shipment` movements (first-expiry-first-out for lot-tracked items) and consumes reservations; delivered or failed closes the note, and partial delivery sets the order to `part_delivered`.
- Invoice from a delivered note, sequential numbering, tax rate setting, PDF print view.
- Payments against invoices with outstanding balance per client (feeds the map panel and Overview).
- Customer returns with inspection and stock release (`customer_return` movements).

## Slice 3: production (implemented; migration pending)

- Production order from the needs list; start reserves materials; complete writes `production_consumption` and `production_output` movements with yield variance and lot creation.

## Cross-cutting enterprise requirements

- **Automated tests**: SQL behavioural tests for every RPC (run against a local Postgres), unit tests for `src/lib/operations.ts`, and Playwright smoke tests for login and each live page. CI runs lint, type check, build and tests on every pull request.
- **Audit**: append-only event tables for orders, deliveries and invoices; no destructive updates of posted documents.
- **Security**: RLS on every table, RPC-only writes for stock and money, per-role API checks, no service key in the browser, rate limits on public routes, dependency audit in CI.
- **Observability**: structured server logs with request ids; error reporting; database slow-query review.
- **Data protection**: scheduled Supabase backups verified by a restore drill; documented retention for personal data (client contacts).
- **Accessibility and i18n**: Arabic RTL and English parity for every new string; keyboard-operable map list view.
- **Housekeeping**: untrack `supabase/.temp/`; reconcile README and workplan statements about purchasing.

## Applying migrations

The previously applied production baseline ends at `20261027032744_fix_stock_workflow_workspace_role_alias.sql`. The customer portal migration `20261027135526_customer_ordering_portal_foundation.sql` and lifecycle migrations `20261028000100` through `20261028000600` are local code and have not been applied to production. Review the migration list and SQL, verify a staging environment, and obtain owner approval before any hosted `supabase db push`. Local migration tests do not constitute production verification.

## Customer account access

- Managers create the client record first, then open **Customer account details** on that client to review linked accounts or invite a customer. Manager-maintained client contact fields are not replaced by the customer's account name or login email; account names live on the customer membership, and login emails live in Supabase Auth.
- Managers can generate a one-time invitation code and shareable link, or send a setup email. The generated code is returned only to the manager performing that action; it is never stored in plaintext. A code is bound to the entered email, expires after seven days and can be redeemed once. A new invitation revokes earlier unredeemed invitations for that client and email.
- Customers use an invitation only to create/link their store membership. New customers choose an account name and password after email verification; existing Auth users keep their current password. Returning customers sign in with email/password or request a one-time email code; they do not need an invitation.
- A manager can send a password-reset email for an active linked account. The customer chooses the new password through the reset link; managers cannot view or set the customer's password. Reset is disabled for inactive clients and memberships.
- Customer login uses email as the identity; username login and phone/SMS login are not enabled.
- The enrollment API redeems the code against the verified email of the active Supabase session. Invitation expiry, revocation, redemption state, client activity and email binding are checked by the database function.
- Customer emails (invitation, existing-account link, password reset) are sent through Resend from `mail@elbarakaepices.com` (`RESEND_API_KEY`; optional `RESEND_FROM_EMAIL`) using bilingual templates in `src/lib/email/`. Supabase Auth still owns identities and tokens: the server generates the Auth token with `auth.admin.generateLink` and puts its hash in a link to `/auth/customer-confirm`, so Supabase SMTP/email templates are not used for these emails. Configure `NEXT_PUBLIC_APP_URL` as the production HTTPS origin and verify the `elbarakaepices.com` sending domain (SPF/DKIM) in Resend. Delivery has not been tested against live Resend/Supabase.
- If an email already belongs to an Auth user, the invitation flow sends a sign-in link rather than trying to create a duplicate identity. An email already linked to this same client cannot be invited again; use the password-reset action for active memberships. Inactive memberships remain disabled and currently have no manager reactivation control. Invitation and reset delivery have not been tested against hosted Supabase.
- Phone sign-in is not enabled: invitations and customer memberships are tied to verified email, and phone OTP also requires an SMS provider and a verified phone-linking flow.

## Slice 2 — Delivery notes (live)

Migration `20261028000200_delivery_notes.sql` adds `erp_create_delivery_note`, `erp_dispatch_delivery_note`, `erp_deliver_delivery_note` and `erp_fail_delivery_note`.

- Flow: confirmed order → delivery note (ready) → dispatched (stock leaves, reservations consumed) → delivered. A failed note restocks and re-reserves.
- Managers create notes; the assigned driver (or a manager) dispatches, delivers or fails them.
- API: `/api/operations/deliveries`. UI: Deliveries page (`LiveDeliveriesPage`) and a "Create delivery note" button on Orders.
- Status: migration tested locally, **not applied to production**. Invoice, return, production and recipe slices are also implemented but their migrations remain pending.

## Slice 3 — Invoices and payments (live)

Migration `20261028000300_invoices_payments.sql` adds `erp_issue_invoice`, `erp_record_payment` and gapless per-year numbering (`INV-YYYY-000001`) through `erp_document_sequences`.

- An invoice is issued from a **delivered** delivery note, once per note. The manager enters the tax rate; the system does not assume Moroccan tax rules, so confirm them with your accountant.
- Payments cannot exceed the balance. Both RPCs are manager-only and idempotent.
- API: `/api/operations/invoices` (balance, paid/partial/unpaid and overdue are derived). UI: `LiveInvoicesPage`.
- Status: tested locally, **not applied to production**.
- Outstanding and overdue invoice balances are shown in the Delivery Map client panel for managers only. Automated tests and CI remain to be added.

## Slice 4 — Customer returns (live)

Migration `20261028000400_customer_returns.sql` adds `erp_create_customer_return`, `erp_receive_customer_return` and `erp_resolve_customer_return`.

- Flow: requested → inspection → released (a `customer_return` movement restores stock to the original shipment location and lot) or rejected (no stock change). Goods under inspection are not counted as on-hand.
- A return can only cover delivered quantities not already in a non-rejected return. Numbers are `RET-YYYY-000001`.
- Managers or the assigned driver can request; only managers receive and decide. All RPCs are idempotent where it matters.
- API: `/api/operations/returns`. UI: `LiveReturnsPage`.
- Status: tested locally, **not applied to production**.

## Slice 5 — Production orders (live)

Migration `20261028000500_production_orders.sql` adds `erp_create_production_order`, `erp_start_production_order`, `erp_complete_production_order` and `erp_cancel_production_order` (manager and purchasing).

- Planning uses the latest **approved** recipe (`PRD-YYYY-000001`). Starting scales each component by target ÷ recipe output, takes it from free (unreserved) warehouse stock, oldest expiry first, and rolls everything back with the shortage list if any component is short.
- Completing records the actual quantity and adds a `production_output` movement under a new lot named after the production number, so output is traceable. Only planned batches can be cancelled.
- API: `/api/operations/production`. UI: `LiveProductionPage`.
- Status: tested locally, **not applied to production**.
- Production component consumption currently occurs at batch start, from free warehouse stock in expiry order. Confirm whether this operational policy is correct before production use.
- Automated tests and CI remain to be added.

## Slice 6 — Recipe management (live)

Migration `20261028000600_recipe_management.sql` adds `erp_save_recipe_draft`, `erp_approve_recipe` and `erp_delete_recipe_draft`.

- Managers and purchasing create and edit drafts (one open draft per product; saving replaces the components). Only managers approve. Approved versions are immutable (database triggers), so changes mean a new version, and production orders keep the version they were planned with.
- Components must be active ingredients, packaging or blends, unique, never the output itself.
- API: `/api/operations/recipes`. UI: `LiveRecipesPage`.
- Status: tested locally, **not applied to production**.
- Automated tests and CI remain to be added.

## Slice 7 — Last preview surfaces removed (signed-in workspace)

Audit result: every signed-in workspace page is wired to live data. Preview/localStorage business data is now used only by the unauthenticated staff preview. The customer portal is also wired to live APIs, but cannot enroll/order on a hosted database until its pending migration and auth configuration are applied.

| Area | Signed-in source |
| --- | --- |
| Overview | `/api/operations/overview` (role-specific metrics: sales this month, open orders, outstanding balance, low stock, open POs, production queue, driver deliveries) |
| Item catalog | Live inventory items via `/api/operations/inventory`; customer product catalog at `/admin/catalog` |
| Role access | Read-only view of the enforced policy; staff accounts at `/admin/users` |
| Sidebar navigation | Fixed `INITIAL_ROLE_ACCESS` policy (no longer editable through localStorage) |
| Delivery Map | Adds each client's outstanding and overdue balance (manager only) |

Overview figures are computed on request, and items with no reorder point are not counted as low stock.
