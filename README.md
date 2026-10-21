# Elbaraka Operations

Next.js workspace prototype for Elbaraka Epices, a spice manufacturer and distributor in Morocco.

## Local setup

1. Install dependencies with `npm install`.
2. Copy `.env.examples` to `.env.local` and fill in your Supabase project URL and public anon/publishable key.
3. Start the application with `npm run dev`.

The current admin workspace is a browser-local preview. Catalog, order, purchase, and role changes are not written to Supabase. Do not enter real customer, supplier, or financial records until sign-in, server-side authorization, database policies, and transactional operations are connected.

The locale defaults to English and supports Arabic with right-to-left layout. Currency defaults to Moroccan dirham (MAD). These are interface defaults; confirm tax, invoice numbering, accounting, and legal document requirements with your Moroccan accountant before using invoices commercially.

## Roles in the prototype

- Owner/manager: all work areas and role-visibility configuration.
- Purchasing: inventory shortages, supplier purchase orders, and production material demand.
- Delivery: order picking, dispatch, delivery notes, and customer returns.

The role selector is for previewing dashboard layouts only. It is not authentication or a security control. Enforce role permissions in server-side code and Supabase Row Level Security before real users or data are enabled.

## Main workflows

- Item catalog: raw materials and blends are stocked in grams; packaging and finished sellable SKUs are stocked by each.
- Recipes: blend batch formulas and finished-good ingredient/packaging requirements.
- Purchasing: supplier orders and receiving preview, with outstanding quantities considered in purchase suggestions.
- Production: suggested production quantities and recipe-expanded raw-material/packaging needs.
- Sales and delivery: customer order notes reserve finished stock; delivery notes record dispatch.
- Finance and returns: MAD invoice previews, payment recording, return inspection, and stock release preview.

See [the enterprise workplan](docs/enterprise-workplan.md) for the phased production architecture and data migration safeguards.
