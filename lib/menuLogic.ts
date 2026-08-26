// Pure menu-mutation helpers. The Menu Service (lib/menu.ts, Task 4) persists
// these changes via Prisma; the pure logic captured here is what lets us verify
// that add-on availability toggles are independent of the parent item.

import type { MenuItem } from "./types";

/**
 * Return a new MenuItem with the given add-on's `available` flag set, leaving
 * the parent item's `available` flag and every other add-on unchanged. The
 * input is not mutated.
 */
export function toggleAddOnAvailability(
  item: MenuItem,
  addOnId: string,
  available: boolean
): MenuItem {
  return {
    ...item,
    addOns: item.addOns.map((addOn) =>
      addOn.id === addOnId ? { ...addOn, available } : addOn
    ),
  };
}
