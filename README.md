# Elbaraka Operations

Next.js workspace prototype for Elbaraka Epices, a spice manufacturer and distributor in Morocco.

## Local setup

1. Install dependencies with `npm install`.
2. Copy `.env.examples` to `.env.local` and fill in your Supabase project URL, publishable key, and server-only secret key. Never use `NEXT_PUBLIC_` for the secret key.
3. Start the application with `npm run dev`.

The signed-in catalog, client and supplier directories, and read-only inventory balances are database-backed. Other operational screens and transactions remain browser-local previews and are not for production use. With Supabase configured, sign-in uses cookie-backed Auth and the admin invite endpoint requires an active manager membership. The demo data in the `elbaraka-preview` workspace is read-only for anonymous database access. Do not use demo records as real business data.

The locale defaults to English and supports Arabic with right-to-left layout. Currency defaults to Moroccan dirham (MAD). These are interface defaults; confirm tax, invoice numbering, accounting, and legal document requirements with your Moroccan accountant before using invoices commercially.

## Shared UI components

The app uses a customized shadcn/ui component set built on Tailwind CSS and Radix UI. Shared primitives live in [`src/components/ui`](src/components/ui), with brand color tokens in `src/app/globals.css` and component aliases in `components.json`. Reuse these primitives for buttons, fields, selects, dialogs, tables, badges, and cards instead of adding new global selectors or one-off controls. `globals.css` holds design tokens only (colors, radii, font sizes, shadows); use semantic utilities such as `bg-card`, `text-muted-foreground`, `border-border` and `text-caption` instead of hex values, and do not add component CSS or global selectors.

## Supabase database and demo fixtures

The Supabase migrations create the canonical `erp_*` and `inventory_*` tables alongside the legacy tables; they do not convert the legacy `products`, orders, or invoices. Back up the project and review/apply migrations before using the database. The legacy tables should remain restricted until their data and policies are reviewed.

To insert the synthetic preview fixtures manually, run [`supabase/seed.sql`](supabase/seed.sql) in the Supabase SQL Editor after applying the schema migrations. The demo-workspace migration already inserts matching fixed-ID fixtures, so this script safely does nothing for rows that are already present. It only targets the `elbaraka-preview` workspace and does not write to legacy tables. Re-running it does not overwrite existing rows. Never treat its stock or documents as real business records.

The newer [catalog migration](supabase/migrations/20261026231500_catalog_products_categories.sql) creates a private Elbaraka workspace and database-backed master product catalog with manager-only edits. After applying it, create the first confirmed Auth user, replace the example email and run `supabase/bootstrap_first_manager.sql`, then run `supabase/catalog_seed.sql` to add the supplied Arabic product names. Those products start uncategorized, with gram stock units and no assumed size or price. Managers can add categories and multiple g/kg variants at `/admin/catalog`; other active workspace users can sign in and view the catalog. User invitations and role management are available at `/admin/users`.

The Supabase catalog, client and supplier master data, and ledger-derived inventory balances are backed by Postgres. Stock-changing commands, orders, purchasing transactions, production, invoices, and returns still use browser preview data and are not yet database-backed.

## Roles in the prototype

- Owner/manager: all work areas and role-visibility configuration.
- Purchasing: inventory shortages, supplier purchase orders, and production material demand.
- Delivery: order picking, dispatch, delivery notes, and customer returns.

The role selector appears only in preview mode and changes local preview visibility; it is not an authorization boundary. Signed-in users are resolved from active workspace membership, and live client, supplier, and inventory endpoints apply server-side role and workspace checks. Other transaction workflows remain preview-only until their database-backed replacements are completed. Dashboard visibility is not a substitute for RLS or authorization.

## Auth setup

1. Back up the project, review the SQL, and apply the inventory, demo workspace, membership, and product-catalog migrations. The legacy tables are not migrated into the catalog.
2. Enable email/password sign-in and email confirmations in Supabase Auth. Set the Site URL and allowed redirect URL to `NEXT_PUBLIC_APP_URL` plus `/auth/confirm`.
3. In the Supabase Dashboard, create the first auth user and confirm its email. Then run `supabase/bootstrap_first_manager.sql` in the SQL Editor after replacing its example email with that user's confirmed email. The script grants the manager role in the private Elbaraka workspace and refuses to run if a workspace manager already exists. Run `supabase/catalog_seed.sql` to add the Arabic catalog list.
4. In Auth > Email Templates, set Confirmation and Invite templates using `supabase/templates/confirmation.html` and `supabase/templates/invitation.html`; use the provided subjects in `supabase/config.toml`. Hosted-project dashboard templates are not changed by local config files.
5. Sign in at `/login`. Configured Supabase sessions open the database-backed catalog at `/admin/catalog`. The manager can invite purchasing, delivery, or additional managers from `/admin/users`.

Server-side APIs use `SUPABASE_SECRET_KEY` (or the legacy server-only `SUPABASE_SERVICE_ROLE_KEY` fallback) for privileged operations and shared Postgres-backed rate limits. This key is never sent to the browser. Do not deploy with the example value. Apply the `distributed_api_rate_limits` migration before deploying these changes.

The public customer-invitation validator also requires `RATE_LIMIT_TRUSTED_IP_HEADER`. Set it to a supported header that your hosting proxy overwrites with the actual client IP (for example, `x-forwarded-for` on Vercel or `cf-connecting-ip` behind Cloudflare). Do not set it to a header that clients can supply unchanged; invite validation fails closed with `503` if the trusted header or a valid client IP is unavailable.

## Client store map

The authenticated client directory includes a Mapbox map view. Managers can enter each store's latitude and longitude in its record; both values must be present and within geographic ranges. Addresses are not geocoded or sent to Mapbox. The map uses only active clients with saved coordinates.

To display tiles, set `MAPBOX_PUBLIC_ACCESS_TOKEN` in `.env.local` to a restricted Mapbox public token (`pk.*`), allow only the application's required origins and map style/tiles, and restart the app. The authenticated server endpoint only returns tokens beginning with `pk.`; never configure a secret-scope token. Mapbox receives normal tile requests for the map's visible area, but addresses are not sent for geocoding and client marker records are not uploaded as a dataset.

## Main workflows

- Item catalog: raw materials and blends are stocked in grams; packaging and finished sellable SKUs are stocked by each.
- Recipes: blend batch formulas and finished-good ingredient/packaging requirements.
- Purchasing: supplier orders and receiving preview, with outstanding quantities considered in purchase suggestions.
- Production: suggested production quantities and recipe-expanded raw-material/packaging needs.
- Sales and delivery: customer order notes reserve finished stock; delivery notes record dispatch.
- Finance and returns: MAD invoice previews, payment recording, return inspection, and stock release preview.

See [the enterprise workplan](docs/enterprise-workplan.md) for the phased production architecture and data migration safeguards.
