# Elbaraka Enterprise Operations Platform

## Purpose

Build a dependable operations system for Elbaraka Epices: a spice manufacturer and distributor. The system must support staff working in purchasing, stores, production, sales, delivery, finance, and management, with supplier and customer-store access added only after internal workflows are reliable.

This plan starts from the business rather than treating the current application or database as the specification. Existing records must be inventoried and reconciled before any migration; no production data should be deleted or silently reinterpreted.

## Confirmed Legacy Database

The provided schema contains `products`, `clients`, `order_notes`, `order_note_items`, `invoices`, and `invoice_items`. The owner reports these tables are unrestricted. The current app uses the public Supabase anon key for direct table reads and writes, and the reviewed source contains no sign-in or role enforcement. Treat the existing data as exposed until access is restricted; rotate any credentials if a secret key was ever placed in browser code or shared outside its intended audience. The anon key is designed to be public, but it is only safe when database policies correctly limit it.

The legacy model is not sufficient as the future system of record: `products.size` is free-form text, `live_stock` has no defined unit or movement history, order status is unconstrained text, and invoices do not model payment, tax, currency, or a formal invoice number. Keep the legacy tables read-only for historical reference during transition. Do not infer units or convert `live_stock` into grams without a verified physical count and an agreed mapping. No table deletion or reset is recommended.

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
- Confirm the hosted Supabase schema and inspect grants, policies, views, functions, storage, users, backups, and deployment configuration. The six supplied tables have no reported access restrictions; treat this as an urgent exposure until verified against the live project.
- Take a verified backup/export. Apply the prepared legacy-table lockdown as soon as the business accepts that the current unauthenticated dashboard will stop working. Do not restore public access to make the legacy UI work; use a controlled maintenance window if needed.
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

## Immediate Implementation Started

An additive database migration is being introduced for the canonical inventory catalog, versioned recipes, locations, lots, reservations, and stock movements. Row-level security is enabled with no user-facing policies yet. A separate migration enables row-level security on all six legacy tables and revokes the anon role's table privileges. This is intentionally not connected to the current browser CRUD: applying the lockdown will stop the legacy dashboard until authentication, permission policies, and transactional server operations exist. No live database migration has been run from this workspace.

The next implementation slice is the authentication/role foundation and an authorized admin catalog vertical slice. Then connect orders and delivery notes to active finished-good SKUs, not to legacy product assumptions. Legacy clients and documents should be migrated only after identifiers, quantities, and financial totals have been reconciled.

## Decisions Still Needed

- Country/jurisdiction, required invoice numbering and tax rules, currency, and language(s).
- Whether accounting is in scope or an integration, and which accounting system is authoritative.
- Number and type of stock locations, and whether lot/expiry tracking applies to every ingredient and finished product.
- Product code/SKU conventions, package variants, recipe tolerances, and approval thresholds.
- Existing system/data sources, business continuity needs, user count, and target availability/recovery objectives.
- Whether suppliers or client stores require portal accounts in the first release or a later phase.
