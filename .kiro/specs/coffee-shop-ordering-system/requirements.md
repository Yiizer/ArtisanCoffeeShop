# Requirements Document

## Introduction

The Coffee Shop Ordering System is an internal, staff-only ordering/POS tool for a small coffee shop. Staff take orders in person at the counter and enter them into the system. This v1 prototype has no authentication: there is no login, no session, and no roles. The system manages menu content, records orders with server-authoritative pricing and daily numbering, drives orders through a fixed status lifecycle with a live polling queue, and provides order history with server-computed aggregates.

These requirements are derived from the approved design document and are written to be consistent with its technical approach: a single Next.js (App Router) TypeScript project, PostgreSQL via Prisma, and short-interval polling for the live queue. The entire UI is collapsed into exactly two pages — an Order-taking page and an Admin page — navigated by a shared client-side mode toggle with no authentication gate between them. All monetary values are stored as integer centavos and formatted to pesos only at display time. All authoritative totals and daily order numbers are computed server-side.

## Glossary

- **System**: The Coffee Shop Ordering System as a whole.
- **Menu_Service**: The component (`lib/menu.ts`) that reads and mutates menu items, sizes, and add-ons.
- **Order_Service**: The component (`lib/orders.ts`) that creates, reads, updates, and cancels orders and owns price and daily-number computation.
- **Summary_Service**: The component (`lib/summary.ts`) that produces server-computed history aggregates.
- **Order_Taking_Page**: The `/order` page containing the Order Entry section and the Live Queue section.
- **Admin_Page**: The `/admin` page containing the Menu Management section and the Order History section.
- **Mode_Toggle**: The shared top-bar control that switches between the Order_Taking_Page and the Admin_Page without any authentication.
- **Order_Entry_UI**: The Order Entry section of the Order_Taking_Page for composing and submitting an order.
- **Order_Queue_UI**: The Live Queue section of the Order_Taking_Page.
- **Business_Day**: The 24-hour period anchored at 2 AM Asia/Manila used for `dailyNumber` and history boundaries.
- **Order_Total**: The `totalPriceCents` value, an integer count of centavos.
- **Daily_Number**: The `dailyNumber` value assigned to an order, sequential within a Business_Day.
- **Order_Status**: One of `PENDING`, `READY`, `COMPLETED`, `CANCELLED`.
- **Payment_Method**: One of `CASH`, `GCASH`.
- **Refunded**: The boolean `refunded` flag on an order.
- **Revenue**: Summed order totals that exclude refunded orders and cancelled-unpaid orders.

## Requirements

### Requirement 1: Two-Page Navigation with Mode Toggle

**User Story:** As the staff user, I want to switch between an order-taking page and an admin page with a single toggle, so that I can move between counter work and management without logging in.

#### Acceptance Criteria

1. THE System SHALL present exactly two pages: the Order_Taking_Page at `/order` and the Admin_Page at `/admin`.
2. THE Order_Taking_Page SHALL contain an Order Entry section and a Live Queue section.
3. THE Admin_Page SHALL contain a Menu Management section and an Order History section.
4. WHEN the staff user activates the Mode_Toggle, THE System SHALL switch between the Order_Taking_Page and the Admin_Page.
5. WHEN a user requests the root route `/`, THE System SHALL redirect the user to the Order_Taking_Page at `/order`.
6. THE System SHALL allow access to the Order_Taking_Page and the Admin_Page without any login or credentials.

### Requirement 2: Menu Management

**User Story:** As the staff user, I want to manage menu items, sizes, and add-ons, so that the order-entry screen reflects the current offerings and prices.

#### Acceptance Criteria

1. WHEN the menu is requested, THE Menu_Service SHALL return all menu items, each including its sizes and add-ons.
2. WHEN a valid menu item (non-empty name, non-empty category, integer `basePriceCents` ≥ 0) is submitted, THE Menu_Service SHALL create the menu item.
3. WHEN an existing menu item is updated with valid fields, THE Menu_Service SHALL apply the changes to that item, including its sizes and add-ons.
4. WHEN a menu item is deleted, THE Menu_Service SHALL remove the item and cascade-remove its sizes and add-ons.
5. WHEN the `available` flag on a MenuItem is toggled, THE Menu_Service SHALL persist the new availability of that item.
6. WHEN the `available` flag on a MenuItemAddOn is toggled, THE Menu_Service SHALL persist the new availability of that add-on independently of its parent item's availability.
7. IF a menu size is submitted, THEN THE Menu_Service SHALL require a non-empty name and an integer `priceDeltaCents`.
8. IF a menu add-on is submitted, THEN THE Menu_Service SHALL require a non-empty name and an integer `priceCents` ≥ 0.

### Requirement 3: Order Entry

**User Story:** As the staff user, I want to compose an order from the menu, so that I can capture what the customer wants at the counter.

#### Acceptance Criteria

1. THE Order_Entry_UI SHALL present menu items organized by category.
2. WHEN a menu item is selected, THE Order_Entry_UI SHALL allow selection of an available size and any available add-ons for that item.
3. THE Order_Entry_UI SHALL allow the staff user to set an integer quantity ≥ 1, add optional per-item notes, and enter an optional customer name.
4. THE Order_Entry_UI SHALL display a running total that is computed on the client for display only.
5. THE Order_Entry_UI SHALL NOT send the client-computed running total to the server as an authoritative Order_Total.
6. WHEN the staff user confirms payment, THE Order_Entry_UI SHALL provide a single-tap confirmation for a Payment_Method of Cash or GCash and SHALL allow an optional GCash reference.

### Requirement 4: Server-Authoritative Order Creation

**User Story:** As the shop owner, I want totals and daily numbers computed on the server, so that pricing and numbering cannot be manipulated by the client.

#### Acceptance Criteria

1. WHEN an order is created, THE Order_Service SHALL compute `totalPriceCents` as the sum over items of `quantity × (basePriceCents + sizeDeltaCents + Σ addOn priceCents)`.
2. WHEN an order is created, THE Order_Service SHALL freeze the computed `totalPriceCents` as a snapshot stored on the order.
3. THE Order_Service SHALL ignore any client-supplied total and SHALL compute `totalPriceCents` exclusively on the server.
4. WHEN an order is created, THE Order_Service SHALL compute `dailyNumber` as the count of existing orders in the current Business_Day plus 1.
5. THE Order_Service SHALL anchor the Business_Day boundary for `dailyNumber` at 2 AM Asia/Manila, so `dailyNumber` restarts at 1 for the first order after that boundary.
6. IF an order payload has an empty items list, a `quantity` less than 1, or an unknown `menuItemId`, `sizeId`, or `addOnId`, THEN THE Order_Service SHALL return HTTP 400 with validation detail and SHALL NOT create the order.
7. IF a submitted `sizeId` or `addOnId` does not belong to the referenced `menuItemId`, THEN THE Order_Service SHALL return HTTP 400 and SHALL NOT create the order.
8. WHEN an order is created, THE Order_Service SHALL set the initial Order_Status to `PENDING`.

### Requirement 5: Live Order Queue

**User Story:** As staff, I want a live queue of the day's orders, so that I can track and advance each order's progress.

#### Acceptance Criteria

1. THE Order_Queue_UI SHALL poll `GET /api/orders` every 3 to 5 seconds to refresh the displayed orders.
2. WHEN the queue is requested without a date, THE Order_Service SHALL return the orders for the current Business_Day.
3. THE System SHALL define the Order_Status lifecycle as `PENDING` → `READY` → `COMPLETED`, with `CANCELLED` reachable from an active order.
4. WHEN staff advance an order's status, THE Order_Service SHALL persist the new Order_Status.
5. WHILE an order's status is `COMPLETED` or `CANCELLED`, THE Order_Queue_UI SHALL keep that order visible for the remainder of the Business_Day.

### Requirement 6: Order Editing

**User Story:** As the staff user, I want to correct an order before preparation starts, so that mistakes captured at the counter can be fixed.

#### Acceptance Criteria

1. WHILE an order's status is `PENDING`, THE Order_Service SHALL allow edits to the order's items, quantities, and notes.
2. IF an items edit is submitted WHILE the order's status is `READY`, `COMPLETED`, or `CANCELLED`, THEN THE Order_Service SHALL return HTTP 409 and SHALL NOT apply the edit.
3. WHEN an items edit is applied, THE Order_Service SHALL recompute `totalPriceCents` using the same server-authoritative formula used at creation.
4. WHEN the Order_Service processes an items edit, THE Order_Service SHALL re-read the current stored status before deciding whether to apply the edit.

### Requirement 7: Order Cancellation and Refund

**User Story:** As staff, I want to cancel an order and record whether a refund is owed, so that cancelled and refunded orders are tracked correctly.

#### Acceptance Criteria

1. WHEN an order is cancelled, THE Order_Service SHALL set the Order_Status to `CANCELLED`.
2. WHEN an order that has `isPaid` true is cancelled, THE Order_Service SHALL set `refunded` to true.
3. IF an order that has `isPaid` false is cancelled, THEN THE Order_Service SHALL leave `refunded` false.
4. THE Order_Service SHALL keep a cancelled order counted in daily order numbering so that `dailyNumber` values have no unexplained gaps.

### Requirement 8: Payment Confirmation

**User Story:** As the staff user, I want to mark an order as paid with a single tap, so that payment status is captured quickly at the counter.

#### Acceptance Criteria

1. WHEN staff confirm payment on an order, THE Order_Service SHALL set `isPaid` to true.
2. WHERE the Payment_Method is GCash, THE Order_Service SHALL accept and store an optional `paymentRef`.
3. THE Order_Service SHALL record the Payment_Method as either `CASH` or `GCASH`.

### Requirement 9: Order History and Aggregates

**User Story:** As the staff user, I want day, week, and month history views with server-computed totals, so that I can review sales without trusting client-side math.

#### Acceptance Criteria

1. WHEN a summary is requested for a view of `day`, `week`, or `month` with an anchor date, THE Summary_Service SHALL return aggregates for the corresponding date range.
2. THE Summary_Service SHALL compute all aggregates server-side in PostgreSQL rather than transferring raw rows for client-side computation.
3. THE Summary_Service SHALL compute Revenue by excluding refunded orders and cancelled-unpaid orders.
4. THE Summary_Service SHALL report refunded amounts in a separate `refundedCents` value distinct from Revenue.
5. THE Summary_Service SHALL count cancelled orders in `totalOrders` and `cancelledOrders` while contributing ₱0 to Revenue for cancelled-unpaid orders.
6. WHEN the view is `week`, THE Summary_Service SHALL snap the date range to Monday through Sunday using the 2 AM Asia/Manila Business_Day boundary.
7. WHEN the view is `month`, THE Summary_Service SHALL snap the date range to the calendar month using the 2 AM Asia/Manila Business_Day boundary.
8. THE Summary_Service SHALL include a per-day breakdown of order count and revenue for the selected range.

### Requirement 10: History Presentation

**User Story:** As the staff user, I want each history view rendered clearly, so that I can navigate and interpret sales data.

#### Acceptance Criteria

1. WHEN the day view is shown, THE System SHALL display a summary card plus a full per-order table for that Business_Day.
2. WHEN the week view is shown, THE System SHALL display a summary card plus a per-day list for Monday through Sunday.
3. WHEN the month view is shown, THE System SHALL display a summary card plus a Recharts bar chart of daily revenue for the calendar month.
4. WHEN the period navigation control is activated, THE System SHALL shift the anchor date by one period in the selected view.
5. WHEN a specific day within the week or month view is selected, THE System SHALL switch to the day view for that date.

### Requirement 11: Monetary Representation

**User Story:** As the shop owner, I want money stored precisely, so that totals are never subject to floating-point error.

#### Acceptance Criteria

1. THE System SHALL store all monetary values as integer centavos.
2. WHEN a monetary value is displayed, THE System SHALL format it in pesos derived from the stored centavos value.
3. THE System SHALL perform all price and aggregate arithmetic using integer centavos.
