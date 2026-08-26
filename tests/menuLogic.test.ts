import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { toggleAddOnAvailability } from "../lib/menuLogic";
import type { MenuItem } from "../lib/types";

// An in-memory menu-item fixture with several add-ons.
function makeFixture(itemAvailable: boolean, addOnCount: number): MenuItem {
  return {
    id: "item-1",
    name: "Latte",
    category: "Coffee",
    basePriceCents: 15000,
    available: itemAvailable,
    sizes: [
      { id: "s1", name: "Small", priceDeltaCents: 0 },
      { id: "s2", name: "Large", priceDeltaCents: 2000 },
    ],
    addOns: Array.from({ length: addOnCount }, (_, i) => ({
      id: `addon-${i}`,
      name: `Add-on ${i}`,
      priceCents: 1000 + i * 100,
      available: true,
    })),
  };
}

describe("menuLogic unit tests", () => {
  it("toggles only the targeted add-on and does not mutate the input", () => {
    const item = makeFixture(true, 3);
    const updated = toggleAddOnAvailability(item, "addon-1", false);

    expect(updated.addOns.find((a) => a.id === "addon-1")?.available).toBe(false);
    expect(updated.addOns.find((a) => a.id === "addon-0")?.available).toBe(true);
    expect(updated.addOns.find((a) => a.id === "addon-2")?.available).toBe(true);
    expect(updated.available).toBe(true);

    // Input is untouched (pure/immutable).
    expect(item.addOns.find((a) => a.id === "addon-1")?.available).toBe(true);
  });
});

describe("Feature: coffee-shop-ordering-system, Property 7: Add-on availability independence", () => {
  it("toggling an add-on changes only that add-on and leaves the item unchanged", () => {
    fc.assert(
      fc.property(
        fc.boolean(), // parent item availability
        fc.integer({ min: 1, max: 8 }), // number of add-ons
        fc.nat(), // index selector for which add-on to toggle
        fc.boolean(), // new availability value
        (itemAvailable, addOnCount, indexSeed, newValue) => {
          const item = makeFixture(itemAvailable, addOnCount);
          const targetIndex = indexSeed % addOnCount;
          const targetId = `addon-${targetIndex}`;

          const updated = toggleAddOnAvailability(item, targetId, newValue);

          // Parent item availability is untouched.
          expect(updated.available).toBe(item.available);

          // Only the targeted add-on's availability changed.
          for (const addOn of updated.addOns) {
            if (addOn.id === targetId) {
              expect(addOn.available).toBe(newValue);
            } else {
              const original = item.addOns.find((a) => a.id === addOn.id)!;
              expect(addOn.available).toBe(original.available);
            }
          }

          // Same set of add-ons, same order, prices unchanged.
          expect(updated.addOns.map((a) => a.id)).toEqual(
            item.addOns.map((a) => a.id)
          );
          expect(updated.addOns.map((a) => a.priceCents)).toEqual(
            item.addOns.map((a) => a.priceCents)
          );
        }
      )
    );
  });
});
