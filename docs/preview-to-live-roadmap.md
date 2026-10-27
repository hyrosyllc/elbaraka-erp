# Preview to Live Roadmap

Status of every workspace page as of 2026-10-28. "Preview" means the page still runs on browser-local demo data and writes nothing to the database. "Live" means it reads and writes Supabase through authenticated API routes and database RPCs.

| Page | Status | Database | Remaining work |
| --- | --- | --- | --- |
| Overview | Preview figures | none | derive metrics from live orders, stock and invoices once those are live |
| Item catalog | Live | `inventory_items`, `erp_products`, `erp_product_sizes` | none for this slice |
| Inventory | Live | movements, lots, reservations, transfers, adjustments | production movements (below) |
| Recipes | Preview | `inventory_recipes`, `inventory_recipe_components` | recipe versioning UI, approval flow |
| Purchasing | Live | purchase orders, receipts, suppliers | supplier invoices and payments |
| Production needs | Preview | `erp_production_orders` | **Slice 3** |
| Clients | Live | `erp_clients` | default driver, move map to its own page |
| Order notes (sales orders) | Live once migration is applied | `erp_sales_orders`, events | apply `20261028000100`; delivery linkage in Slice 2 |
| Delivery notes | Preview | `erp_delivery_notes` | **Slice 2** |
| Invoices | Preview | `erp_invoices`, `erp_payments` | **Slice 2** |
| Returns | Preview | `erp_customer_returns` | **Slice 2** |
| Delivery map | Live once migration is applied | clients plus orders | outstanding balance in panel after Slice 2 (spec: `delivery-map.md`) |
| Role access | Preview | memberships | live role matrix editor |
| Customer portal | Live, migration pending | `erp_customer_*`, `erp_submit_customer_order` | apply migration `20261027135526`, order tracking |

## Slice 1: sales order lifecycle and delivery map (built, awaiting `supabase db push`)

Migration `20261028000100_sales_order_lifecycle.sql`:

- Manager creates a draft order (or receives one from the customer portal), then confirms it. Confirming reserves stock atomically from warehouse locations and fails with `insufficient_stock` rather than overselling.
- Cancelling releases reservations. Orders that have started delivery cannot be cancelled.
- Assigning a driver, requested date, priority and notes is allowed while the order is open.
- Every action writes an `erp_sales_order_events` row.

Application: live Orders page, live Delivery map page, role-filtered APIs, idempotent order creation.

## Slice 2: delivery, invoicing, returns

- Delivery note from a confirmed order; dispatch writes `shipment` movements (first-expiry-first-out for lot-tracked items) and consumes reservations; delivered or failed closes the note, and partial delivery sets the order to `part_delivered`.
- Invoice from a delivered note, sequential numbering, tax rate setting, PDF print view.
- Payments against invoices with outstanding balance per client (feeds the map panel and Overview).
- Customer returns with inspection and stock release (`customer_return` movements).

## Slice 3: production

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

Migrations are tested locally against a clean Postgres before being pushed. Pushing to the hosted project is a deliberate step by the project owner: `supabase db push` after reviewing the new files in `supabase/migrations`. Migration `20261027135526` (customer ordering portal) is still pending and must be applied before the portal works.

## Slice 2 — Delivery notes (live)

Migration `20261028000200_delivery_notes.sql` adds `erp_create_delivery_note`, `erp_dispatch_delivery_note`, `erp_deliver_delivery_note` and `erp_fail_delivery_note`.

- Flow: confirmed order → delivery note (ready) → dispatched (stock leaves, reservations consumed) → delivered. A failed note restocks and re-reserves.
- Managers create notes; the assigned driver (or a manager) dispatches, delivers or fails them.
- API: `/api/operations/deliveries`. UI: Deliveries page (`LiveDeliveriesPage`) and a "Create delivery note" button on Orders.
- Status: migration tested locally, **not applied to production**.
- Next: invoices and payments, customer returns, production orders, live recipes, automated tests.

## Slice 3 — Invoices and payments (live)

Migration `20261028000300_invoices_payments.sql` adds `erp_issue_invoice`, `erp_record_payment` and gapless per-year numbering (`INV-YYYY-000001`) through `erp_document_sequences`.

- An invoice is issued from a **delivered** delivery note, once per note. The manager enters the tax rate; the system does not assume Moroccan tax rules, so confirm them with your accountant.
- Payments cannot exceed the balance. Both RPCs are manager-only and idempotent.
- API: `/api/operations/invoices` (balance, paid/partial/unpaid and overdue are derived). UI: `LiveInvoicesPage`.
- Status: tested locally, **not applied to production**.
- Next: show outstanding balance in the Delivery Map client panel, customer returns, production orders, live recipes, automated tests.

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
- Remaining: live recipe editing and approval UI, outstanding balance in the map client panel, automated tests and CI.

## Slice 6 — Recipe management (live)

Migration `20261028000600_recipe_management.sql` adds `erp_save_recipe_draft`, `erp_approve_recipe` and `erp_delete_recipe_draft`.

- Managers and purchasing create and edit drafts (one open draft per product; saving replaces the components). Only managers approve. Approved versions are immutable (database triggers), so changes mean a new version, and production orders keep the version they were planned with.
- Components must be active ingredients, packaging or blends, unique, never the output itself.
- API: `/api/operations/recipes`. UI: `LiveRecipesPage`.
- Status: tested locally, **not applied to production**.
- Remaining: outstanding balance in the map client panel, automated tests and CI.

## Slice 7 — Last preview surfaces removed (signed-in users)

Audit result: when signed in, **every** work area is database-backed. Preview/localStorage data is now only used by the unauthenticated preview mode.

| Area | Signed-in source |
| --- | --- |
| Overview | `/api/operations/overview` (role-specific metrics: sales this month, open orders, outstanding balance, low stock, open POs, production queue, driver deliveries) |
| Item catalog | Live inventory items via `/api/operations/inventory`; customer product catalog at `/admin/catalog` |
| Role access | Read-only view of the enforced policy; staff accounts at `/admin/users` |
| Sidebar navigation | Fixed `INITIAL_ROLE_ACCESS` policy (no longer editable through localStorage) |
| Delivery Map | Adds each client's outstanding and overdue balance (manager only) |

Overview figures are computed on request, and items with no reorder point are not counted as low stock.
