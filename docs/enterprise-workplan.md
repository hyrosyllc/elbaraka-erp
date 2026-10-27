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

The authenticated user-administration, catalog, client, supplier, inventory, and purchasing slices are database-backed. Other operational screens and workflows remain preview-only and may read/write browser `localStorage`; a successful page render does not mean an operational workflow is live.

The client directory has authenticated workspace-scoped reads and manager-only create, edit, and deactivate/reactivate operations. The supplier directory has authenticated workspace-scoped reads and manager/purchasing create, edit, and deactivate/reactivate operations. Inventory reads balances by item/location from the immutable movement ledger, active reservations, and quarantined lots; the view runs with caller privileges and underlying RLS. Delivery staff can see finished-good balances and movements but not raw-material balances. Inventory setup, purchase-order creation/order/cancellation, partial receiving with lot and quarantine details, transfers, and adjustment requests/reviews now use authenticated database operations. Rollback-only checks passed idempotency, partial receipts, transfer balances, insufficient-stock rejection, adjustment self-review denial, and the corrected workspace-role checks without leaving fixture rows.

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

The client and supplier directories are implemented as live slices. Clients are manager-managed; suppliers are manager/purchasing-managed. Both read through authenticated, workspace-scoped routes and use explicit loading/error/empty states. Client store mapping supports manually entered coordinates and a Mapbox list/map view; no address geocoding is used. The coordinate migration is applied in production. A restricted public Mapbox token is still required to render tiles; the authenticated token endpoint rejects secret-scope tokens. The signed-in Inventory screen shows live movement-ledger balances and recent movements, with manager controls for item/location setup, transfers, and reviewed adjustments. The signed-in Purchasing screen includes the supplier directory, purchase orders, ordering/cancellation, and partial receiving. The main workspace currently has no operational inventory items, locations, suppliers, or opening balances, so these workflows require approved setup before they can process real stock. Keep orders/invoices metrics out of the live client directory until those modules are also database-backed; do not mix demo financial values with live clients.

### Customer ordering portal (implementation in progress)

The customer portal is a separate, client-scoped experience from the staff operations dashboard. The customer entry and ordering experience now owns `/`; the staff dashboard is at `/staff`, with staff authentication at `/login`. Customer APIs verify confirmed Supabase Auth email identities and active store memberships server-side. The database migration is still pending and must be reviewed and applied before these routes can operate against a database. Keep the existing ERP tables as the operational source of truth; do not revive the legacy order or invoice tables.

**Customer journey**

1. **Enter store code:** the store enters a code supplied by Elbaraka. The server validates it and identifies the client account without disclosing whether arbitrary client identifiers exist. A store code is an onboarding/invitation credential, not a reusable query parameter or a substitute for an authenticated account.
2. **Authenticate and bind the account:** redeem a single-use, expiring invite for the store and bind the customer’s own Supabase Auth identity to that client. A manager can issue an email-bound invite from the live client directory; the raw code is shown once and only its hash is stored. Supabase email OTP/magic-link confirmation is used thereafter. Support multiple named customer users per store. A shared permanent store password/code would provide weak account recovery and no individual auditability; do not use it to expose order history or invoices.
3. **Browse and select:** show only active, sellable finished-product package sizes, grouped by active category, with Arabic-first names, search, list/grid toggle, and touch-friendly `+`/`−` quantity controls. Keep the cart count/next action visible while scrolling. Do not expose raw materials, internal stock balances, supplier data, or other clients. Availability shown to customers must be an approved business rule rather than an unfiltered movement-ledger value.
4. **Review:** show selected product/size, quantity, unit price, line subtotal, and order total. Allow quantity changes and adding another item through an accessible product search/dropdown without losing the cart. Display any delivery/minimum-order rules before confirmation.
5. **Submit and track:** confirmation creates a server-validated order request and displays its reference and current status. The customer account lists its own submitted, accepted, partially fulfilled, delivered, or cancelled orders. Staff acceptance is the point at which the ERP confirms pricing/availability and creates any stock reservation; customer submission alone must not decrement stock or promise inventory.
6. **Invoices:** show invoice documents only after the database-backed delivery-to-invoice workflow exists. Allow viewing/downloading an immutable invoice snapshot and payment/status information the business has approved for customer visibility. Do not serve the legacy invoices or fabricate invoice data from preview state.

**Implementation status and remaining gates**

1. **Sign-in decision and first portal implementation — code in place, unverified:** use Supabase Auth email OTP with an individual confirmed email account, following store invitation validation. Supabase SMTP is configured by the owner with `mail@elbarakaepices.com`; no email has been sent by this implementation. Before a pilot, verify deliverability, Auth redirect URLs, OTP expiry/rate limits, and CAPTCHA/risk controls. Phone OTP is not selected.
2. **Customer identity and invites — schema/API/UI in place, migration pending:** customer memberships are separate from staff roles. Manager invite issuance and one-time code display are wired into the live client directory; codes are email-bound, high-entropy, expiring, and hashed at rest. Revocation/rotation, shared attempt throttling, and security-event auditing remain release requirements.
3. **Catalog readiness — mapping controls in place, data setup pending:** managers can map a package size to one active finished-good inventory item within their workspace. The migration enforces workspace-consistent mappings. Still load approved categories and inventory, map only verified SKUs, and confirm prices, display names, minimum quantities, and orderable products. Do not infer mappings from the existing catalog or demo fixtures.
4. **Customer browse/review — initial code in place, test gate pending:** customer-only catalog and order-history APIs plus Arabic/English, RTL, search, grid/list, cart, review, and order confirmation UI are implemented. The current cart is held in page memory; reliable persistence across refreshes is not yet implemented.
5. **Customer submission — transaction/API in place, SQL test gate pending:** submission validates membership, package mappings, current server-side prices, and quantities, snapshots line details, and uses an idempotency key. A customer request is saved as `draft` and does not reserve stock or confirm availability.
6. **Staff review and downstream sales — not implemented:** staff review/accept/reject/cancel actions and atomic reservation/status transitions are still required. Then connect picking, partial delivery, invoice issuance, and customer invoice access to live workflows.
7. **Release verification — not started:** test cross-client isolation, invalid/expired/replayed invitation denial, idempotent submission, stale-price behavior, concurrent acceptance, inaccessible invoices, and network recovery. Run responsive mobile and Arabic RTL browser tests with customer and staff test accounts. Do not apply the migration until it is reviewed and confirmed as the only pending migration.

**Prerequisites / release blockers:** the main workspace currently has no operational categories, inventory items, locations, or opening balances; the catalog size table is not linked to finished-good inventory until managers configure mappings. The new migration has not been applied or exercised against Postgres. SMTP is configured, but pilot email delivery and Auth redirect/OTP settings still need verification. Staff approval, delivery, and invoice mutations are not yet database-backed. Production customer orders must not be enabled until master data, identity, stock policy, staff review, and invoice workflows pass their respective gates.

### Sales order lifecycle and Delivery Map (2026-10-28, written, not yet applied to production)

Migration `20261028000100_sales_order_lifecycle.sql` adds RPC-only order creation, confirmation with atomic stock reservation (first-expiry-first-out across warehouse locations), cancellation that releases reservations, driver/date/priority assignment, a default driver per client, and an append-only order event log. It is tested against a clean local Postgres (idempotent create, reservation, shortage rollback, cancel release, role denial). The app adds the live Orders page, the standalone Delivery Map page, and `/api/operations/orders` plus `/api/operations/delivery-map`. The old embedded map in the Clients page was removed. See [delivery-map.md](./delivery-map.md) for the feature spec and [preview-to-live-roadmap.md](./preview-to-live-roadmap.md) for the remaining slices (delivery notes, invoices and payments, returns, production).

### Cutover gates

- Keep the legacy schema/data as read-only historical reference until a separately reviewed mapping and reconciliation migration is agreed.
- The production catalog has 90 rows but currently has no categories and is not linked to the inventory ledger. Do not silently classify catalog items, infer pack sizes, or assign opening quantities.
- Keep demo seed files separate from production migrations. A normal production migration push must not run seed SQL.
- For each database change, dry-run, review the exact migration list, apply only the intended migrations, then verify remote migration history, grants/RLS, and data counts. No workflow is marked complete based only on a successful build.
- Before enabling write workflows, verify the manager account can log in and that denied roles/actions remain denied. Do not expose service-role credentials to browser code.

## Decisions Still Needed

- Country/jurisdiction, required invoice numbering and tax rules, currency, and language(s).
- Customer accounts use one-time store invitations followed by Supabase Auth email OTP (selected); SMTP is configured with `mail@elbarakaepices.com`. Confirm pilot email delivery and whether multiple named customer users per store are required (recommended).
- Whether accounting is in scope or an integration, and which accounting system is authoritative.
- Number and type of stock locations, and whether lot/expiry tracking applies to every ingredient and finished product.
- Product code/SKU conventions, package variants, recipe tolerances, and approval thresholds.
- Existing system/data sources, business continuity needs, user count, and target availability/recovery objectives.
- Whether suppliers or client stores require portal accounts in the first release or a later phase.
