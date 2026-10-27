# Delivery Map

A standalone workspace page (`/staff`, page id `map`) that shows every client store as a pin on a Mapbox map. It replaces the small embedded map that used to live inside the Clients page. The Clients page keeps only the coordinate fields used to place a pin.

## Goals

- See where every client is and which ones need attention first.
- Colour pins by **urgency** or by **who is responsible** (driver), switchable with one control.
- Click a pin to open a side panel with the client's contact details, open orders, order history and the person in charge.
- Let a manager assign or change the driver, delivery date and priority of an order without leaving the map.
- Let a driver see only the clients and orders assigned to them.

## Roles

| Role | Sees | Can change |
| --- | --- | --- |
| manager | all clients and orders | driver, delivery date, priority, default driver per client |
| purchasing | page hidden | nothing |
| delivery | only clients with orders assigned to them, plus clients whose default driver is them | nothing (status updates arrive with the delivery slice) |

Access is enforced twice: the API filters by role, and the database RPCs check the caller's workspace membership. The UI only hides controls.

## Data model

Added by migration `20261028000100_sales_order_lifecycle.sql`:

- `erp_clients.default_driver_id`: the person normally responsible for a store.
- `erp_sales_orders.assigned_driver_id`, `requested_delivery_date`, `priority` (`normal` | `urgent`), `notes`, `confirmed_at`, `cancelled_at`, `cancel_reason`.
- `erp_sales_order_events`: append-only history (created, confirmed, assigned, rescheduled, cancelled) used by the side panel timeline.

Client coordinates (`latitude`, `longitude`) already exist. Clients without coordinates are listed in a "Not on map" tray so nothing is silently hidden.

## Urgency rules

Evaluated against today's date in the `Africa/Casablanca` time zone, using the client's open orders (`draft`, `confirmed`, `part_delivered`). The most severe state wins.

| State | Colour token | Rule |
| --- | --- | --- |
| Overdue | `destructive` (red) | an open order has a requested date before today |
| Due today | `saffron` (amber) | requested date is today, or the order is marked urgent |
| Upcoming | `primary` (green) | open order with a later or no requested date |
| Awaiting confirmation | `subtle` (grey-blue) | only `draft` orders (typically from the customer portal) |
| No open orders | `border` (light grey) | nothing to deliver |

## Driver colouring

Each driver is assigned a stable colour from a fixed palette, ordered by name so colours do not shuffle between visits. The pin shows the driver of the most urgent open order, falling back to the client's default driver. Unassigned clients are shown in grey with a dashed ring. A legend lists drivers with a count and doubles as a filter.

## Side panel

Opening a pin shows:

1. Header: name, city, urgency badge, phone (tap to call), address, and an "Open in Maps" link.
2. In charge: current driver and default driver, with an assignment control for managers.
3. Open orders: number, status, requested date, priority, line count, total in MAD.
4. History: last 20 orders with status, and the order event timeline (confirmed by, assigned to, cancelled and why).
5. Money: managers see each client's outstanding invoice balance and overdue portion. These totals come from live invoices less recorded payments; delivery-role responses do not include invoice amounts.

## API

- `GET /api/operations/delivery-map`: clients with coordinates and derived urgency, open orders, driver list, and role-filtered results. Manager responses also include client outstanding and overdue invoice balances. Also used to fill the "Not on map" tray.
- `GET /api/operations/orders?clientId=...`: order history and events for one client.
- `POST /api/operations/orders`: actions `create`, `confirm`, `cancel`, `assign` (driver, date, priority, notes). Every action is idempotent where a client retry is possible.

## Mapbox

The public token is served by `/api/operations/mapbox-token` and must be a `pk.` token restricted by URL in the Mapbox dashboard. When the token is missing or the map fails, the page falls back to a sortable list of the same clients so staff can still work.

## Acceptance checks

- Pins render for every client with coordinates; the tray lists the rest.
- Changing the colour mode updates pins without reloading data.
- A driver account only sees its own assigned clients.
- Assigning a driver from the panel changes the pin colour immediately and is recorded in the timeline.
- Keyboard users can reach the list view of every client and open the same panel.
- Arabic (RTL) layout mirrors the panel and legend.
