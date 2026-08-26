// Temporary end-to-end smoke test against the running dev server.
// Exercises: menu read -> create order -> edit while PENDING -> 409 guard
// after READY -> mark paid -> cancel/refund -> summary aggregates.

const BASE = "http://localhost:3000";
let failures = 0;

function check(label, condition, detail = "") {
  if (condition) {
    console.log(`  PASS  ${label}`);
  } else {
    failures++;
    console.log(`  FAIL  ${label} ${detail}`);
  }
}

async function req(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* no body */
  }
  return { status: res.status, json };
}

const peso = (c) => `P${(c / 100).toFixed(2)}`;

async function main() {
  console.log("\n== 1. Menu ==");
  const menu = await req("GET", "/api/menu");
  check("GET /api/menu returns 200", menu.status === 200, `got ${menu.status}`);
  check("menu has seeded items", Array.isArray(menu.json) && menu.json.length > 0);

  const item = menu.json.find((m) => m.sizes.length > 0 && m.addOns.length > 0);
  check("found an item with sizes + add-ons", !!item);
  if (!item) return;

  const size = item.sizes[1] ?? item.sizes[0];
  const addOn = item.addOns.find((a) => a.available);
  const expectedTotal =
    (item.basePriceCents + size.priceDeltaCents + (addOn?.priceCents ?? 0)) * 2;
  console.log(
    `  using "${item.name}" size "${size.name}" addOn "${addOn?.name}" qty 2 -> expect ${peso(expectedTotal)}`
  );

  console.log("\n== 2. Create order (server computes total) ==");
  const created = await req("POST", "/api/orders", {
    customerName: "Maria",
    paymentMethod: "GCASH",
    // Deliberately bogus client total: the server must ignore it.
    totalPriceCents: 1,
    items: [
      {
        menuItemId: item.id,
        sizeId: size.id,
        quantity: 2,
        notes: "no sugar",
        addOnIds: addOn ? [addOn.id] : [],
      },
    ],
  });
  check("POST /api/orders returns 201", created.status === 201, `got ${created.status}`);
  const order = created.json;
  check(
    `server total is ${peso(expectedTotal)} (client total ignored)`,
    order?.totalPriceCents === expectedTotal,
    `got ${order?.totalPriceCents}`
  );
  check("dailyNumber assigned >= 1", order?.dailyNumber >= 1, `got ${order?.dailyNumber}`);
  check("initial status RECEIVED", order?.status === "RECEIVED", `got ${order?.status}`);
  check("isPaid defaults false", order?.isPaid === false);

  console.log("\n== 3. Validation (400s) ==");
  const emptyItems = await req("POST", "/api/orders", {
    paymentMethod: "CASH",
    items: [],
  });
  check("empty items -> 400", emptyItems.status === 400, `got ${emptyItems.status}`);

  const badQty = await req("POST", "/api/orders", {
    paymentMethod: "CASH",
    items: [{ menuItemId: item.id, quantity: 0, addOnIds: [] }],
  });
  check("quantity 0 -> 400", badQty.status === 400, `got ${badQty.status}`);

  const badRef = await req("POST", "/api/orders", {
    paymentMethod: "CASH",
    items: [{ menuItemId: "does-not-exist", quantity: 1, addOnIds: [] }],
  });
  check("unknown menuItemId -> 400", badRef.status === 400, `got ${badRef.status}`);

  console.log("\n== 4. Edit while RECEIVED (allowed, total recomputed) ==");
  const edited = await req("PATCH", `/api/orders/${order.id}`, {
    kind: "items",
    items: [
      { menuItemId: item.id, sizeId: size.id, quantity: 1, addOnIds: [] },
    ],
  });
  const expectedEdited = item.basePriceCents + size.priceDeltaCents;
  check("items edit while RECEIVED -> 200", edited.status === 200, `got ${edited.status}`);
  check(
    `total recomputed to ${peso(expectedEdited)}`,
    edited.json?.totalPriceCents === expectedEdited,
    `got ${edited.json?.totalPriceCents}`
  );

  console.log("\n== 5. Status lifecycle + 409 edit guard ==");
  const ready = await req("PATCH", `/api/orders/${order.id}`, {
    kind: "status",
    status: "READY",
  });
  check("advance to READY -> 200", ready.status === 200, `got ${ready.status}`);

  const lateEdit = await req("PATCH", `/api/orders/${order.id}`, {
    kind: "items",
    items: [{ menuItemId: item.id, sizeId: size.id, quantity: 5, addOnIds: [] }],
  });
  check("items edit past RECEIVED -> 409", lateEdit.status === 409, `got ${lateEdit.status}`);

  const stillSame = await req("GET", "/api/orders");
  const found = stillSame.json.find((o) => o.id === order.id);
  check(
    "rejected edit left the total unchanged",
    found?.totalPriceCents === expectedEdited,
    `got ${found?.totalPriceCents}`
  );

  console.log("\n== 6. Mark paid ==");
  const paid = await req("PATCH", `/api/orders/${order.id}`, {
    kind: "payment",
    isPaid: true,
    paymentRef: "GC-12345",
  });
  check("mark paid -> 200", paid.status === 200, `got ${paid.status}`);
  check("isPaid true", paid.json?.isPaid === true);
  check("paymentRef stored", paid.json?.paymentRef === "GC-12345", `got ${paid.json?.paymentRef}`);

  console.log("\n== 7. Cancel a PAID order -> refunded ==");
  const cancelled = await req("DELETE", `/api/orders/${order.id}`);
  check("cancel -> 200", cancelled.status === 200, `got ${cancelled.status}`);
  check("status CANCELLED", cancelled.json?.status === "CANCELLED", `got ${cancelled.json?.status}`);
  check("refunded true (was paid)", cancelled.json?.refunded === true);

  console.log("\n== 8. Cancel an UNPAID order -> not refunded ==");
  const unpaid = await req("POST", "/api/orders", {
    paymentMethod: "CASH",
    items: [{ menuItemId: item.id, sizeId: size.id, quantity: 1, addOnIds: [] }],
  });
  const cancelledUnpaid = await req("DELETE", `/api/orders/${unpaid.json.id}`);
  check("refunded stays false when unpaid", cancelledUnpaid.json?.refunded === false);

  console.log("\n== 9. A completed, paid order contributes revenue ==");
  const good = await req("POST", "/api/orders", {
    paymentMethod: "CASH",
    items: [{ menuItemId: item.id, sizeId: size.id, quantity: 3, addOnIds: [] }],
  });
  const goodTotal = good.json.totalPriceCents;
  await req("PATCH", `/api/orders/${good.json.id}`, { kind: "payment", isPaid: true });
  for (const s of ["READY", "COMPLETED"]) {
    await req("PATCH", `/api/orders/${good.json.id}`, { kind: "status", status: s });
  }
  const completed = await req("GET", "/api/orders");
  const g = completed.json.find((o) => o.id === good.json.id);
  check("order reached COMPLETED", g?.status === "COMPLETED", `got ${g?.status}`);
  check(
    "COMPLETED/CANCELLED orders stay visible in the day queue",
    completed.json.some((o) => o.status === "CANCELLED") &&
      completed.json.some((o) => o.status === "COMPLETED")
  );

  console.log("\n== 10. Summary aggregates ==");
  const today = g.createdAt.slice(0, 10);
  for (const view of ["day", "week", "month"]) {
    const s = await req("GET", `/api/admin/summary?view=${view}&anchorDate=${today}`);
    check(`summary ${view} -> 200`, s.status === 200, `got ${s.status}`);
    const sum = s.json;
    const dailyRev = sum.dailyBreakdown.reduce((a, d) => a + d.revenueCents, 0);
    const dailyOrders = sum.dailyBreakdown.reduce((a, d) => a + d.orders, 0);
    check(`${view}: daily revenue reconciles to revenueCents`, dailyRev === sum.revenueCents,
      `${dailyRev} vs ${sum.revenueCents}`);
    check(`${view}: daily counts reconcile to totalOrders`, dailyOrders === sum.totalOrders,
      `${dailyOrders} vs ${sum.totalOrders}`);
    if (view === "day") {
      console.log(
        `    revenue=${peso(sum.revenueCents)} refunded=${peso(sum.refundedCents)} ` +
          `orders=${sum.totalOrders} cancelled=${sum.cancelledOrders} ` +
          `cash=${peso(sum.cashCents)} gcash=${peso(sum.gcashCents)}`
      );
      check("refunded amount is reported separately", sum.refundedCents > 0);
      check("cancelled orders counted", sum.cancelledOrders >= 2);
      check(
        "revenue excludes refunded + cancelled-unpaid",
        sum.revenueCents === goodTotal,
        `expected ${goodTotal} got ${sum.revenueCents}`
      );
    }
  }

  const badView = await req("GET", `/api/admin/summary?view=year&anchorDate=${today}`);
  check("invalid view -> 400", badView.status === 400, `got ${badView.status}`);

  console.log("\n== 11. Menu CRUD ==");
  const newItem = await req("POST", "/api/menu", {
    name: "Smoke Test Brew",
    category: "Test",
    basePriceCents: 12345,
    sizes: [{ name: "Regular", priceDeltaCents: 0 }],
    addOns: [{ name: "Extra", priceCents: 500, available: true }],
  });
  check("create menu item -> 201", newItem.status === 201, `got ${newItem.status}`);
  const newId = newItem.json?.id;

  const badItem = await req("POST", "/api/menu", {
    name: "",
    category: "Test",
    basePriceCents: -5,
    sizes: [],
    addOns: [],
  });
  check("invalid menu item -> 400", badItem.status === 400, `got ${badItem.status}`);

  const toggled = await req("PATCH", `/api/menu/${newId}`, { available: false });
  check("toggle item availability -> 200", toggled.status === 200);
  check("item now unavailable", toggled.json?.available === false);

  const addOnId = newItem.json.addOns[0].id;
  const addOnToggled = await req("PATCH", `/api/menu/${newId}`, {
    toggleAddOn: { addOnId, available: false },
  });
  check("toggle add-on availability -> 200", addOnToggled.status === 200);
  check("add-on now unavailable", addOnToggled.json?.available === false);

  const afterToggle = await req("GET", "/api/menu");
  const parent = afterToggle.json.find((m) => m.id === newId);
  check(
    "add-on toggle did not change other add-ons",
    parent.addOns.length === 1 && parent.addOns[0].available === false
  );

  const del = await req("DELETE", `/api/menu/${newId}`);
  check("delete menu item -> 200", del.status === 200);
  const afterDelete = await req("GET", "/api/menu");
  check("item removed", !afterDelete.json.some((m) => m.id === newId));

  console.log("\n== 12. Pages render ==");
  for (const path of ["/order", "/admin"]) {
    const res = await fetch(`${BASE}${path}`);
    const html = await res.text();
    check(`GET ${path} -> 200`, res.status === 200, `got ${res.status}`);
    check(`${path} renders shell`, html.includes("Artisan Coffee Shop"));
  }
  const root = await fetch(`${BASE}/`, { redirect: "manual" });
  check(
    "GET / redirects to /order",
    [307, 308, 302].includes(root.status),
    `got ${root.status}`
  );

  console.log(
    `\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}\n`
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("Smoke test crashed:", e);
  process.exit(1);
});
