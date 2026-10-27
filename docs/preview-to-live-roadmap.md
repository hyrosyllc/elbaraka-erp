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
