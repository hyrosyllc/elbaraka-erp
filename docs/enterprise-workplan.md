# Elbaraka Enterprise Operations Platform

## Purpose

Build a dependable operations system for Elbaraka Epices: a spice manufacturer and distributor. The system must support staff working in purchasing, stores, production, sales, delivery, finance, and management, with supplier and customer-store access added only after internal workflows are reliable.

This plan starts from the business rather than treating the current application or database as the specification. Existing records must be inventoried and reconciled before any migration; no production data should be deleted or silently reinterpreted.

## Confirmed Legacy Database

The provided legacy schema contains `products`, `clients`, `order_notes`, `order_note_items`, `invoices`, and `invoice_items`; the supplied `order_notes` definition was repeated, so verify the live schema rather than applying the duplicate as DDL. The owner reports these tables are unrestricted. The earlier legacy dashboard used the public Supabase anon key for direct table reads and writes without sign-in or role enforcement. This repository now includes cookie-backed authentication and a manager-only user administration API, but the main operations dashboard still uses browser-local preview data and is not connected to these legacy tables or the canonical ERP tables. Treat the legacy data as exposed until access is restricted; rotate any credentials if a secret key was ever placed in browser code or shared outside its intended audience. The anon key is designed to be public, but it is only safe when database policies correctly limit it.

The legacy model is not sufficient as the future system of record: `products.size` is free-form text, `live_stock` has no defined unit or movement history, order status is unconstrained text, and invoices do not model payment, tax, currency, or a formal invoice number. Keep the legacy tables read-only for historical reference during transition. Do not infer units or convert `live_stock` into grams without a verified physical count and an agreed mapping. No table deletion or reset is recommended.

The current catalog slice adds a private Elbaraka workspace and a separate `erp_products` master catalog, editable categories, and optional per-product package sizes in grams with optional SKU and price. The supplied Arabic product names are inserted without assigning category, size, price, or operational stock. This catalog is not yet linked to `inventory_items`, sales, or manufacturing transactions; complete that mapping only after confirming the product/SKU, pack, and stock rules.

## Platform Decision

- Keep Next.js as the first-party web application. It fits admin and office workflows and works on warehouse tablets and phones when made responsive.
- Keep PostgreSQL as the system of record. Supabase can remain the managed PostgreSQL, authentication, and realtime provider while it meets operational, security, recovery, and availability requirements.
- Put authorization and business transactions on trusted server-side paths or database functions. Browser code must not be trusted to enforce permissions, validate stock, or calculate financial totals.
- Start as a modular monolith with clear domain boundaries. Do not introduce microservices until measured scale or integration requirements justify their operating cost.
- Consider Expo as a separate mobile client for specific native needs such as barcode scanning, offline receiving, camera capture, or driver workflows. It should use the same authenticated business operations, not own a second copy of business rules.

## Operating Model

### Roles and access

- System administrator: users, roles, configuration, catalog, locations, and operational oversight.
- Purchasing: suppliers, purchase requests and orders, expected receipts, and supplier performance.
- Storekeeper: receiving, put-away, lot identification, transfers, counts, and adjustments subject to approval.
- Production: approved formulas, production orders, material issue, actual consumption, output, yield, and quality records.
- Sales and distribution: customer stores, quotes or orders, stock allocation, picking, delivery notes, returns, and customer balances.
- Accountant: approved invoices and credit notes, payments, tax configuration, reconciliations, and accounting exports.
- Analyst and manager: permission-scoped reports and approved operational metrics; no untracked editing of source transactions.
- Supplier and customer users: only their own purchase orders, delivery/receipt information, statements, or order status when the portal phase is approved.

Use least privilege, explicit role-to-action permissions, and organization/location scope where appropriate. Record who performed sensitive actions. External users must never be able to query other organizations' records.

### Product and stock model

Use one item catalog for all stock-bearing things, with distinct item types:

- Raw spices and other ingredients: base stock unit is grams (`g`). Purchasing quantities can be entered in kg and converted to grams by validated server-side logic.
- Intermediate blends: base stock unit is grams (`g`) and can be an output of one recipe and an input to another.
- Packaging: base stock unit is each (`each`), such as jars, pouches, labels, cartons, and caps.
- Finished goods: base stock unit is each (`each`), with a sellable SKU, pack size, and net spice weight in grams. A 50 g jar is one finished item with 50 g net content, not 50 g of finished-item stock.

Recipes/BOMs define component quantities in each component's base unit and a planned output quantity in the output item's base unit. A finished SKU's recipe may consume a blend/raw spice quantity and packaging components per produced unit or batch. Approved recipe versions are immutable; changes create a new version.

Never make an editable stock total the source of truth. Record append-only, attributable stock movements for physical changes such as receipts, production consumption/output, shipments, returns, transfers, opening balances, and adjustments. Store reservations separately from physical movements; calculate on-hand from the movement ledger and available stock as on-hand minus active reservations. Use server-side locking/transactions to prevent overselling and lost updates. Track supplier/manufacturing lots and expiry where required, including traceability from incoming material to produced batch and delivered customer order.

Orders and delivery notes select only active finished-good SKUs from this catalog. Each document retains a snapshot of SKU, description, unit price, and relevant pack information so later catalog edits cannot rewrite historical documents.

## Business Workflows

1. **Catalog setup:** Administrator creates raw materials, packaging, blends, and finished SKUs; sets codes, units, pack weights, lot/expiry rules, and status; defines locations and approved recipes.
2. **Procure and receive:** Purchase order -> supplier confirmation -> receipt by quantity and lot -> quality/quarantine decision -> put-away -> supplier invoice matching.
3. **Manufacture:** Production order from demand or replenishment -> reserve/issue ingredients and packaging -> record actual quantities and lot consumption -> record output, yield, waste, and quality -> release finished lots.
4. **Sell and deliver:** Customer order -> pricing/credit checks -> reservation -> pick/pack -> delivery note with quantities and lots -> proof of delivery -> invoice -> payment, return, or credit note.
5. **Count and reconcile:** Scheduled cycle counts -> variance review -> approved adjustment movement -> reconciled inventory valuation and audit trail.
6. **Close and analyze:** Reconcile sales, purchases, stock valuation, customer/supplier balances, and cash/bank activity; report from validated source records with documented metric definitions.

## Delivery Workplan

### Phase 0: Confirm requirements and protect current data

- Map the real current process with the people performing each job, including exceptions and paper documents.
- Confirm the hosted Supabase schema and inspect grants, policies, views, functions, storage, users, backups, and deployment configuration. The legacy-table RLS lockdown and `anon` privilege revocation have already been applied; verify those controls remain in place.
- Verify a backup/export before any future data conversion. Legacy rows remain preserved, and no new migration should delete or silently rewrite them. Do not restore public access to make the legacy UI work; use a controlled maintenance window if needed.
- Confirm country/jurisdiction, tax and invoice requirements, currency, languages, fiscal periods, accounting software, warehouse locations, lot/expiry practices, and who approves prices, stock changes, and credit.
- Decide whether this is one Elbaraka organization with external counterparties or a multi-company product. Do not add tenant complexity until this is answered.
- Export and reconcile existing products, clients, orders, invoices, and stock. Preserve identifiers and document the mapping to the new catalog and documents. Treat legacy stock as an unverified opening-balance claim until physically counted.

**Exit criteria:** legacy data backed up; public table access removed; signed-off workflow maps, role matrix, data dictionary, legal/accounting decisions, and approved migration/reconciliation approach.

### Phase 1: Secure application and canonical catalog

- Establish deployment environments, secret handling, database migrations, backups/restore tests, monitoring, and CI checks.
- Implement sign-in, user provisioning, role assignments, server-side authorization, and default-deny database policies. Test each role against allowed and denied actions.
- Finish the canonical item catalog in the admin dashboard: create/edit/deactivate raw materials, packaging, intermediate blends, and finished SKUs; validate unit/type/pack-size rules; search, filter, and import a reviewed initial list of roughly 50 sellable SKUs plus raw materials.
- Implement recipe versioning and components, including spice quantities in grams and packaging quantities in each. Allow drafts and require approval before production use.
- Add audit events for catalog and recipe changes. Historical referenced records are deactivated, not hard-deleted.

**Exit criteria:** an authorized admin can manage the complete catalog and recipes; unauthorized users are denied; catalog data is migrated and reconciled; existing ordering screens can consume active finished SKUs from the canonical catalog.

### Phase 2: Inventory, purchasing, and traceability

- Add locations, lots, receiving, quality status, stock ledger, reservations, transfers, cycle counts, and controlled adjustments.
- Add supplier records, purchasing approvals, purchase orders, partial receipts, and supplier invoice matching.
- Provide a stock view showing on-hand, reserved, available, quarantined, and expired quantities by item, location, and lot.
- Prove concurrent receipts, reservations, and adjustments cannot create negative or duplicated stock unintentionally.

**Exit criteria:** physical counts reconcile to ledger balances; every balance change has a source and actor; a raw-material lot can be traced forward to finished lots and deliveries.

### Phase 3: Production and quality

- Create production orders from demand or replenishment using an approved recipe version.
- Capture planned versus actual component consumption, lot selection, yield, waste, operator, timestamps, and quality results.
- Release finished lots only after required quality checks; preserve the exact recipe and component lots used.

**Exit criteria:** batch genealogy and inventory costing can be reconstructed for a completed production run; deviations and holds are visible and controlled.

### Phase 4: Sales, delivery, and finance

- Implement customer/store accounts, price lists, order entry, credit rules, availability checks, reservations, picking, and dispatch.
- Generate delivery notes from customer orders and invoices from approved delivered quantities; handle partial delivery, returns, credit notes, and payments.
- Decide and implement accounting integration or the approved accounting scope, including local tax and invoice compliance. Do not label invoices paid without a recorded payment/reconciliation.

**Exit criteria:** end-to-end orders reconcile from customer order through stock movement, delivery evidence, invoice, and payment/receivable balance.

### Phase 5: Portals, mobile, and analytics

- Pilot external supplier and customer portals with strict record-level access and invitation/identity controls.
- Add an Expo mobile app only for validated workflows needing native scanning, offline capture/sync, camera, or route support.
- Add management dashboards for purchasing lead times, stock turns, expiry exposure, production yield, service level, returns, margin, and receivables using agreed definitions.

**Exit criteria:** portal isolation is security-tested; mobile sync handles retries and conflicts; report figures reconcile to operational source records.

## Quality and Release Gates

- Automated tests cover domain rules, permissions, transactional operations, and core purchase-to-payment and production-to-delivery workflows.
- Every stock-affecting command is idempotent, validated, atomic, audited, and concurrency-tested.
- Every role has positive and negative authorization tests; external access is isolated by organization/account.
- Database migrations are reviewed, repeatable, and tested against a production-like copy before release. Backups have been restored in a drill.
- Staged rollout includes pilot users, training, parallel reconciliation, support ownership, and rollback criteria.

## Current Implementation Status (2026-10-27)

Production migrations have been applied through `20261027032744_fix_stock_workflow_workspace_role_alias.sql`. This includes the canonical ERP tables, workspace membership/RLS foundation, catalog tables, legacy-table RLS lockdown, trigger-function permission hardening, live client/supplier writes, invoker-secure inventory balance read models, and transactional purchasing/receiving/stock-control RPCs. The forward fix adds the required workspace-role result alias to all nine stock workflow RPCs. The legacy rows have not been deleted or migrated. The legacy tables no longer grant `anon` access; the old browser-based app must not be used as an operational interface.

The signed-in workspace now routes every operational area through live data-backed pages: overview, catalog, inventory, recipes, purchasing, production, clients, sales orders, deliveries, map, invoices, returns and staff access. The unauthenticated staff preview still uses browser-local demo data by design. The customer portal has invitation-based account enrollment and live API flows in code. These implementation statements do not mean the newer migrations have been deployed or that hosted auth email delivery and production workflows have passed acceptance.

The client directory has authenticated workspace-scoped reads and manager-only create, edit, and deactivate/reactivate operations. Managers create the client first; the account-management panel then opens so they can link the customer separately. Manager-maintained contact fields remain distinct from the customer's account name and Supabase Auth email. Managers can generate a one-time email-bound code and shareable link, send a setup email, and trigger a customer-chosen password reset by email. Invitation records expire after seven days, store only a hash, and revoke prior unused invitations for the same client/email. Supabase Auth link expiry follows its hosted configuration. New customers choose a password after verification; existing Auth users retain their password when linking another client. Returning customers can use email/password or an email sign-in code without another invitation. Phone login is not implemented. Email sending and the complete hosted redirect flow have not been verified.

The supplier directory has authenticated workspace-scoped reads and manager/purchasing create, edit, and deactivate/reactivate operations. Inventory reads balances by item/location from the immutable movement ledger, active reservations, and quarantined lots; the view runs with caller privileges and underlying RLS. Delivery staff can see finished-good balances and movements but not raw-material balances. Inventory setup, purchase-order creation/order/cancellation, partial receiving with lot and quarantine details, transfers, and adjustment requests/reviews now use authenticated database operations. Rollback-only checks passed idempotency, partial receipts, transfer balances, insufficient-stock rejection, adjustment self-review denial, and the corrected workspace-role checks without leaving fixture rows.

Signed-in Overview metrics are requested from `/api/operations/overview`; they do not use preview figures. Signed-in navigation follows the fixed workspace role policy, while the access page displays that policy read-only. Server routes and database role checks, not the UI, remain the authorization boundary.

Live workspace inventory (read-only counts; do not interpret as business approval):

| Area | Main workspace (`elbaraka-main`) | Demo workspace (`elbaraka-preview`) | Status |
|---|---:|---:|---|
| Catalog products | 90 | 0 | Main catalog rows exist; category assignment and inventory/SKU linkage remain incomplete |
| Catalog categories | 0 | 0 | Catalog administration is live, but production categories have not been loaded |
| Clients | 0 | 3 | Live manager-managed directory; production records have not been entered |
| Suppliers | 0 | 2 | Live manager/purchasing-managed directory; production records have not been entered |
| Inventory items | 0 | 12 | Main inventory screen is ledger-backed, but the main workspace has no operational stock items or opening balances |
| Workspace memberships | 1 active manager | — | Internal access exists; user identity must still be verified through login |

### Database-backed rollout sequence

Do not delete preview data or treat demo rows as production. Each milestone replaces one module end-to-end: production RLS/grants, server-side role checks, validated reads/writes, concurrency-safe transactions where balances/documents change, UI loading/error/empty states, and authorization/business-rule tests.

1. **Foundation and master data (in progress):** dashboard identity and role-aware shell; production client and supplier CRUD; catalog categories/products/package sizes; map sellable catalog sizes to inventory items; approved initial categories, units, SKUs, locations, and opening-count process. Never copy demo stock into the main workspace.
2. **Inventory and procurement (live foundation):** live item/location balances and manager-controlled item/location setup are implemented. Purchasing supports purchase-order creation, ordering/cancellation, idempotent partial receipts, lots, expiry, and quarantine. Inventory supports idempotent transfers and reviewed adjustments, with immutable movement records and server-side stock checks. Still required: link approved catalog SKUs to inventory items; configure real locations and operational stock items; reconcile physical opening counts; implement cycle counts and production/sales reservations; test under concurrent real-user activity; and complete an authenticated UI smoke test. Never infer or copy opening balances from demo data.
3. **Recipes and production:** approved immutable recipe versions, production planning, lot-aware component consumption, yield/output, quality status, and batch genealogy.
4. **Sales and delivery:** customer ordering portal; live client orders against active finished SKUs; server-side availability/price checks and stock reservation; staff approval, picking/dispatch/delivery notes, partial delivery, and proof-of-delivery records.
5. **Invoices, payments, and returns:** invoice only from approved delivered quantities; immutable document snapshots and numbering; payment ledger and customer returns/inspection/credit workflow. Confirm tax/legal invoice requirements before claiming legal compliance.
6. **Reporting and preview retirement:** dashboard KPIs from reconciled database queries; role-scoped reports; remove operational `localStorage` persistence and simulated role switching only after all replacement workflows pass acceptance and reconciliation.

### Master-data implementation milestone

The client and supplier directories are implemented as live slices. Clients are manager-managed; suppliers are manager/purchasing-managed. Both read through authenticated, workspace-scoped routes and use explicit loading/error/empty states. Client store mapping supports manually entered coordinates and a Mapbox list/map view; no address geocoding is used. The coordinate migration is applied in production. A restricted public Mapbox token is still required to render tiles; the authenticated token endpoint rejects secret-scope tokens. The signed-in Inventory screen shows live movement-ledger balances and recent movements, with manager controls for item/location setup, transfers, and reviewed adjustments. The signed-in Purchasing screen includes the supplier directory, purchase orders, ordering/cancellation, and partial receiving. The signed-in Delivery Map and Overview now include live invoice balance metrics for managers. The main workspace counts above are a dated snapshot, not an assertion that setup is complete today; verify approved inventory items, locations, suppliers and opening balances before processing real stock. Never mix demo financial values with live client data.

### Customer ordering portal (implemented in code; release pending)

The customer portal is a separate, client-scoped experience from staff operations. Customer ordering owns `/`; staff use `/staff` and sign in at `/login`. Customer APIs verify Supabase Auth users and active customer memberships server-side. The customer portal migration `20261027135526_customer_ordering_portal_foundation.sql` has not been applied to production. Keep the canonical ERP tables as the operational source of truth; do not revive legacy order or invoice tables.

**Customer account journey**

1. A manager creates a client record with its business/contact details, then uses **Customer account details**. The account panel opens after client creation and is also available on existing client records.
2. The manager chooses to generate a one-time code and shareable link, or to send a setup email. The generated code is returned only to the manager who requested it. The database stores its SHA-256 hash, binds it to the supplied email, expires the invitation after seven days, and permits one redemption. Issuing another invite revokes earlier unused invites for that client/email.
3. New Auth identities receive a Supabase invitation email; existing Auth identities receive a sign-in email rather than a duplicate identity. An email already linked to this same client is rejected. For an active linked membership, use the password-reset action; inactive memberships remain disabled and currently have no manager reactivation control. Supabase Auth link expiry follows hosted Auth settings.
4. After email verification, a new customer supplies an account name and password; an existing Auth user supplies an account name and keeps their current password. The enrollment API links the verified Auth user to the client by redeeming the invitation through a database function. Account name and login email remain separate from the manager-owned client contact fields. The manager can send a reset email for active linked accounts, but cannot view or set the customer's password.
5. The invitation is only for enrollment. Returning customers sign in at `/` using email/password, or request a one-time email sign-in code; no store invitation is required. Email is the account identity—username and phone/SMS login are not implemented. Phone login would require an SMS provider and a verified phone-linking flow.
6. Access to catalog, orders and store accounts is scoped by active membership. Multiple named customer users per client are supported by the schema. Customers see active sellable product sizes, category, price and their own order history—not internal stock, supplier information or other clients.

**Order and fulfillment behavior**

- Customer order submission validates membership, active package-size/product/inventory mappings, quantity and current server-side price. It snapshots product details and uses an idempotency key. A submitted customer order is a `draft`; it does not reserve stock.
- Staff order confirmation is the availability/stock commitment point. The sales-order lifecycle migration implements atomic reservation, cancellation release, driver/date/priority assignment and append-only order events.
- Delivery notes, dispatch/stock movements, partial delivery, invoices/payments and customer returns each have live API/UI and transactional migrations. Recipe and production management are also implemented. The migrations remain pending on the hosted database.
- Customer invoice viewing, durable cart recovery and staff review decisions for rejecting customer-submitted drafts remain follow-up work; do not claim these features are available in the customer portal.

**Release gates**

1. Apply and verify the customer portal and lifecycle migrations in staging, then obtain explicit owner approval before any production push.
2. Set `NEXT_PUBLIC_APP_URL` to the production HTTPS origin; allow-list `/auth/customer-confirm*` for it in Supabase Auth; verify the `elbarakaepices.com` domain in Resend and set `RESEND_API_KEY`. Invitation and reset emails are sent by Resend with Supabase-generated token hashes routed through the callback; the customer's self-requested email-code login still uses Supabase's mailer and its OTP template/SMTP. Invitation/reset delivery and redirects have not been verified against hosted Supabase.
3. Verify approved categories, inventory items, locations/opening balances, product/package mappings, names and prices before inviting pilot customers. Production inventory is not seeded from demo data.
4. Test cross-client isolation, invalid/expired/revoked/replayed invitations, email mismatch, existing-user invite, password setup, email/password login, OTP login, idempotent submission, stale prices, order confirmation and cancellation, and network recovery. Add browser tests for mobile and Arabic RTL.
5. Confirm customer-order review and rejection behavior with the business, then implement customer invoice access only with an approved visibility and document policy. Add shared rate limiting and security-event auditing to public auth/invitation endpoints before a broad rollout.

### Sales order lifecycle and Delivery Map (2026-10-28, written, not yet applied to production)

Migration `20261028000100_sales_order_lifecycle.sql` adds RPC-only order creation, confirmation with atomic stock reservation (first-expiry-first-out across warehouse locations), cancellation that releases reservations, driver/date/priority assignment, a default driver per client, and an append-only order event log. It is tested against a clean local Postgres (idempotent create, reservation, shortage rollback, cancel release, role denial). The app adds the live Orders page, the standalone Delivery Map page, and `/api/operations/orders` plus `/api/operations/delivery-map`. The old embedded map in the Clients page was removed. See [delivery-map.md](./delivery-map.md) for the feature spec and [preview-to-live-roadmap.md](./preview-to-live-roadmap.md) for the remaining slices (delivery notes, invoices and payments, returns, production).

### Cutover gates

- Keep the legacy schema/data as read-only historical reference until a separately reviewed mapping and reconciliation migration is agreed.
- The production catalog has 90 rows but currently has no categories and is not linked to the inventory ledger. Do not silently classify catalog items, infer pack sizes, or assign opening quantities.
- Keep demo seed files separate from production migrations. A normal production migration push must not run seed SQL.
- For each database change, dry-run, review the exact migration list, apply only the intended migrations, then verify remote migration history, grants/RLS, and data counts. No workflow is marked complete based only on a successful build.
- Before enabling write workflows, verify the manager account can log in and that denied roles/actions remain denied. Do not expose service-role credentials to browser code.

## Theming

- Light and dark themes are token-driven: `:root` and `.dark` in `src/app/globals.css` define every colour, including the brand gradient (`bg-brand-gradient`) and the page gradient. Components must use tokens (`bg-card`, `text-muted-foreground`, `bg-destructive-soft`) and never hard-coded colours such as `bg-white` or `text-emerald-900`.
- `ThemeToggle` (`src/components/theme/ThemeToggle.tsx`) is in the admin header, customer portal and staff login. The choice is stored in `elbaraka-theme-v1`; the first visit follows the OS setting. An inline script in `layout.tsx` applies the class before paint to avoid a flash.
- The delivery map switches between Mapbox `streets-v12` and `dark-v11`.
- Text/background pairs were checked against WCAG AA (4.5:1) in both themes. Re-check any new token pair.

## Decisions Still Needed

- Country/jurisdiction, required invoice numbering and tax rules, currency, and language(s).
- Customer enrollment uses a one-time email-bound store invitation and verified Supabase Auth email; returning access supports email/password or email OTP. Confirm the production SMTP/template/redirect configuration and pilot email delivery. The schema supports multiple named customer users per store. Phone sign-in is not enabled.
- Whether accounting is in scope or an integration, and which accounting system is authoritative.
- Number and type of stock locations, and whether lot/expiry tracking applies to every ingredient and finished product.
- Product code/SKU conventions, package variants, recipe tolerances, and approval thresholds.
- Existing system/data sources, business continuity needs, user count, and target availability/recovery objectives.
- Whether suppliers or client stores require portal accounts in the first release or a later phase.

## Staff routing and catalog

- Staff pages are real routes: `/staff`, `/staff/<page>`, `/staff/catalog/{categories|stock}` (catch-all `src/app/staff/[[...slug]]`). Sidebar and breadcrumbs are links, so back navigation works.
- Item catalog manages customer products, variants (price, SKU, stock link) and categories. `/admin/catalog` redirects to `/staff/catalog`.
- Product detail page: `/staff/catalog/products/<id>` (manager only) shows KPIs, monthly revenue, per-size performance, order status mix, top clients, returns, stock movements, production runs, CSV export and print. Data comes from `/api/admin/catalog/products/<id>/analytics?range=30|90|365|all`; sales attach to a product through each pack size's linked stock item, so unlinked sizes show no sales.

## Client money and delivery handling (migration `20261029000100`, not yet applied)

Real-world cases and how the system handles them:

| Situation | What to do | What the system records |
|---|---|---|
| Items missing at the door; client paid in full | Deliveries → **Deliver with missing items**, enter missing quantity per line and a reason | Delivered lines shrink to what was handed over; missing units return to stock (`customer_return` movement) and are re-reserved on the order, which stays `part_delivered`. Invoice only covers delivered goods. The remainder shows as **Still to ship** on the client account and ships in a new delivery note. Any overpayment shows as **Credit**; use **Refund overpayment** to hand cash back |
| Client returns an old product, value deducted (474 − 8 = 466 MAD) | Invoices (or client account) → **Adjust** → *Return credit*, amount 8, description | `erp_invoice_adjustments` row (negative amount). Balance = total + adjustments − payments. Original invoice total is never edited |
| Client did not pay, "come later" | Nothing to do on the invoice; on the client account **Add follow-up** → *Promise to pay* with a date | Invoice stays outstanding and becomes overdue after its due date; the promise is listed, turns red when its date passes, and is closed with **Mark done** |
| Client history | Clients → **View account** (`/staff/clients/<id>`) | Invoiced, paid, still owed, overdue, returned, credit, units still to ship; invoices with payments and adjustments; orders, deliveries, returns; follow-ups |

Technical notes: adjustments and notes are written only through RPCs (`erp_add_invoice_adjustment`, `erp_add_client_note`, `erp_resolve_client_note`, `erp_deliver_delivery_note_with_shortages`); `erp_record_payment` now allows payment up to total + adjustments. Overview, Delivery Map and Invoices all include adjustments in balances. Applying a credit to a later invoice is not automated yet: a credit is shown and can be refunded.

## Rich clients page and in-page operations

- `/staff/clients` offers list, grid, board (grouped by balance, portal account, status or city) and timeline views with search, status/portal/balance/city filters, sorting and analytics cards (`ClientsViews`). The chosen view is remembered per browser.
- Row actions are icon-only at the end of each row: edit, activate/deactivate, manage portal account. Portal account status is shown on every client.
- `GET /api/operations/clients` returns per-client `metrics` (invoiced, paid, outstanding, overdue, credit, orders, returns, last order).
- `/staff/clients/<id>` has an Operations section (`ClientOperations`): new order note, confirm/cancel order, create delivery note, dispatch, deliver, deliver with missing items, fail, issue invoice and record return. Payments, adjustments/refunds and follow-up notes are on the same page.
- The client page and its APIs are manager-only because they expose balances and payments. A limited delivery-role view would need its own API.

## Stock setup and receiving

- Product page: each unlinked size has **Create stock item** (finished good, counted in units, SKU taken from the size), and the toolbar has a bulk action for all unlinked active sizes. Sizes need a SKU first.
- Inventory page: **Receive stock** (manager and purchasing) adds stock directly as opening balance, purchase receipt or production output, with lot code/expiry for lot-tracked items. Entries are recorded against the user (`erp_receive_stock`, migration `20261029000200`). Increases only; decreases still use the two-person adjustment workflow.

## End-to-end loop audit (purchase → stock → order → delivery → invoice → return)

Closed in this pass:
- Customer portal catalog and ordering no longer hide sizes without a stock item; the stock item is created on the first order (service role, `ensureSizeStockItem(..., 'direct')`).
- Releasing a customer return can credit the invoice of the same delivery (value = returned qty × delivered price + tax). The key is derived from the return, so it cannot be credited twice.
- `erp_apply_client_credit` (migration `20261029000300`) moves a client's overpaid credit to another invoice of the same client atomically.
- Confirm failures on the client page now list the short SKUs.

Gap closure (migration `20261030000100`):

- **Partial orders:** `erp_confirm_sales_order(order, allow_partial)` reserves what exists; `erp_reserve_order_remaining` tops up later. Delivery notes only claim free reserved stock.
- **Old-product returns:** `erp_record_external_return` credits the invoice (optionally restocking a non-lot item). Button "Return old item" on the client profile invoices.
- **Rejected returns:** `erp_return_dispositions` records restocked/written-off quantities, shown on the Returns page (managers).
- **Supplier payables:** `erp_supplier_payments`; payable = received value − payments (no prepayments). Panel on the Purchasing page; managers pay.
- **Marketplace and margins:** `erp_material_prices` ticks (manual, or automatic from purchase order lines). Marketplace page: price table, charts, supplier quotes, margins and 30-day realized profit (managers). Cost uses the latest material price (replacement cost), not a weighted average.
- **Portal:** `/api/customer/account` shows invoices, credits and balance in the order history view.
