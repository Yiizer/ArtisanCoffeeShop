# Artisan Coffee Shop

An internal, staff-facing ordering / POS tool for a small coffee shop. Staff take
orders in person at the counter and enter them into the system, track payment
(Cash or GCash), and move each order through a fixed lifecycle
(`PENDING → READY → COMPLETED`, or `CANCELLED`).

This is a **v1 prototype with no authentication** — there is no login, no session,
and no roles. It is designed to run on a single shared device at the counter.
The entire UI is two pages, switched by a top-bar mode toggle.

Built with Next.js 15 (App Router) + React 19 + TypeScript, PostgreSQL via
Prisma 6, Tailwind CSS, and Recharts for the monthly history chart.

## The two pages

- **`/order` — Order-taking page** (the root `/` redirects here)
  - **Order Entry**: pick menu items by category, choose a size and add-ons, set
    quantity and per-item notes, add an optional customer name, and confirm a
    Cash or GCash payment (with an optional GCash reference). A live running
    total is shown for display only and is never sent to the server.
  - **Live Queue**: polls the day's orders every few seconds; advance an order's
    status, mark it paid, or cancel it. Completed and cancelled orders stay
    visible for the rest of the day.
- **`/admin` — Admin page**
  - **Menu Management**: create, edit, and delete menu items, sizes, and add-ons,
    with availability toggles for both items and individual add-ons.
  - **Order History**: day, week, and month views with server-computed
    aggregates (revenue, refunds, cash/GCash split, order counts). The month view
    renders a daily-revenue bar chart. Navigate between periods and drill down
    from a week/month day into that day's detail.

## Money convention

All monetary values are stored and computed as **integer centavos** (e.g. `15000`
= ₱150.00) to avoid floating-point error. Values are formatted to pesos only at
display time. Order totals and daily order numbers are always computed on the
server; the client never supplies an authoritative total.

## Prerequisites

- **Node.js** 18+ (developed on Node 24).
- A running **PostgreSQL** database you can connect to.

## Setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Configure the database connection**

   Copy the example env file and set your database URL:

   ```bash
   cp .env.example .env
   ```

   Then edit `.env` so `DATABASE_URL` points at your PostgreSQL instance:

   ```dotenv
   DATABASE_URL="postgresql://postgres:postgres@localhost:5432/artisan_coffee?schema=public"
   ```

3. **Generate the Prisma client**

   ```bash
   npm run prisma:generate
   ```

4. **Run the database migration**

   Creates the tables for menu items, orders, and their variants:

   ```bash
   npm run prisma:migrate
   ```

5. **Seed placeholder menu data**

   Seeds several categories of menu items with sizes and add-ons. It seeds **no
   orders and no staff accounts** — orders are created at runtime through the app.

   ```bash
   npm run prisma:seed
   ```

## Running the app

Start the development server:

```bash
npm run dev
```

Then open http://localhost:3000 — the root route redirects to `/order`. Use the
mode toggle in the top bar to switch between the Order-taking and Admin pages.

For a production build:

```bash
npm run build
npm run start
```

## Running tests

Unit and property-based tests (Vitest + fast-check) cover the pure business
logic — pricing, daily numbering, the edit guard, cancellation/refund rules,
summary aggregation, and range snapping:

```bash
npm test
```

## Project layout

- `app/` — App Router pages (`/order`, `/admin`) and API route handlers
  (`/api/menu`, `/api/orders`, `/api/admin/summary`).
- `components/` — the top bar plus the order and admin section components.
- `lib/` — pure logic modules (pricing, business-day/daily-number, order rules,
  summary logic) and the Prisma-backed services.
- `prisma/` — the schema, migrations, and seed script.
- `tests/` — Vitest unit and property tests.
