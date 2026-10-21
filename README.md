# Elbaraka Operations

Next.js workspace prototype for Elbaraka Epices, a spice manufacturer and distributor in Morocco.

## Local setup

1. Install dependencies with `npm install`.
2. Copy `.env.examples` to `.env.local` and fill in your Supabase project URL, publishable key, and server-only secret key. Never use `NEXT_PUBLIC_` for the secret key.
3. Start the application with `npm run dev`.

The browser preview remains available until Supabase is configured. With Supabase configured, sign-in uses cookie-backed Auth and the admin invite endpoint requires an active manager membership. The demo data is stored in the `elbaraka-preview` workspace and remains read-only for anonymous preview. Do not use demo records as real business data.

The locale defaults to English and supports Arabic with right-to-left layout. Currency defaults to Moroccan dirham (MAD). These are interface defaults; confirm tax, invoice numbering, accounting, and legal document requirements with your Moroccan accountant before using invoices commercially.

## Roles in the prototype

- Owner/manager: all work areas and role-visibility configuration.
- Purchasing: inventory shortages, supplier purchase orders, and production material demand.
- Delivery: order picking, dispatch, delivery notes, and customer returns.

The role selector is only available in local preview mode. In Supabase mode, the signed-in user's role comes from `erp_workspace_memberships`; the user-management API rechecks manager membership server-side. Dashboard visibility is not a substitute for RLS or authorization.

## Auth setup

1. Apply the inventory, demo workspace, and membership migrations with the Supabase CLI after reviewing them against a backup and the target project's schema.
2. Enable email/password sign-in and email confirmations in Supabase Auth. Set the Site URL and allowed redirect URL to `NEXT_PUBLIC_APP_URL` plus `/auth/confirm`.
3. In the Supabase Dashboard, create the first auth user and confirm its email. Then run `supabase/bootstrap_first_manager.sql` in the SQL Editor after replacing its example email with that user's confirmed email. The script refuses to run if a workspace manager already exists.
4. In Auth > Email Templates, set Confirmation and Invite templates using `supabase/templates/confirmation.html` and `supabase/templates/invitation.html`; use the provided subjects in `supabase/config.toml`. Hosted-project dashboard templates are not changed by local config files.
5. Sign in at `/login`. The manager can invite purchasing, delivery, or additional managers from `/admin/users`.

The manager invitation endpoint requires `SUPABASE_SECRET_KEY` (or the legacy server-only `SUPABASE_SERVICE_ROLE_KEY` fallback). This key is never sent to the browser. Do not deploy with the example value.

## Main workflows

- Item catalog: raw materials and blends are stocked in grams; packaging and finished sellable SKUs are stocked by each.
- Recipes: blend batch formulas and finished-good ingredient/packaging requirements.
- Purchasing: supplier orders and receiving preview, with outstanding quantities considered in purchase suggestions.
- Production: suggested production quantities and recipe-expanded raw-material/packaging needs.
- Sales and delivery: customer order notes reserve finished stock; delivery notes record dispatch.
- Finance and returns: MAD invoice previews, payment recording, return inspection, and stock release preview.

See [the enterprise workplan](docs/enterprise-workplan.md) for the phased production architecture and data migration safeguards.
