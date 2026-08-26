import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the Prisma client (lib/db.ts) so these tests never touch a real
// database. vi.hoisted lets us reference the mock inside the vi.mock factory
// (which is hoisted above imports) and in assertions below.
const mockPrisma = vi.hoisted(() => ({
  menuItem: {
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  menuItemAddOn: {
    update: vi.fn(),
  },
}));

vi.mock("../lib/db", () => ({
  default: mockPrisma,
  prisma: mockPrisma,
}));

import {
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
  setItemAvailability,
  setAddOnAvailability,
  MenuValidationError,
  type MenuItemInput,
} from "../lib/menu";

function validInput(overrides: Partial<MenuItemInput> = {}): MenuItemInput {
  return {
    name: "Latte",
    category: "Coffee",
    basePriceCents: 15000,
    sizes: [{ name: "Small", priceDeltaCents: 0 }],
    addOns: [{ name: "Oat Milk", priceCents: 2000, available: true }],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createMenuItem validation (Requirements 2.2, 2.7, 2.8)", () => {
  it("rejects an empty name and does not touch the database", async () => {
    await expect(createMenuItem(validInput({ name: "" }))).rejects.toBeInstanceOf(
      MenuValidationError
    );
    await expect(
      createMenuItem(validInput({ name: "   " }))
    ).rejects.toBeInstanceOf(MenuValidationError);
    expect(mockPrisma.menuItem.create).not.toHaveBeenCalled();
  });

  it("rejects an empty category", async () => {
    await expect(
      createMenuItem(validInput({ category: "" }))
    ).rejects.toBeInstanceOf(MenuValidationError);
    expect(mockPrisma.menuItem.create).not.toHaveBeenCalled();
  });

  it("rejects a negative basePriceCents", async () => {
    await expect(
      createMenuItem(validInput({ basePriceCents: -1 }))
    ).rejects.toBeInstanceOf(MenuValidationError);
    expect(mockPrisma.menuItem.create).not.toHaveBeenCalled();
  });

  it("rejects a non-integer basePriceCents", async () => {
    await expect(
      createMenuItem(validInput({ basePriceCents: 150.5 }))
    ).rejects.toBeInstanceOf(MenuValidationError);
    expect(mockPrisma.menuItem.create).not.toHaveBeenCalled();
  });

  it("rejects a size with a non-integer priceDeltaCents (Req 2.7)", async () => {
    await expect(
      createMenuItem(validInput({ sizes: [{ name: "Large", priceDeltaCents: 20.5 }] }))
    ).rejects.toBeInstanceOf(MenuValidationError);
    expect(mockPrisma.menuItem.create).not.toHaveBeenCalled();
  });

  it("rejects a size with an empty name (Req 2.7)", async () => {
    await expect(
      createMenuItem(validInput({ sizes: [{ name: "", priceDeltaCents: 0 }] }))
    ).rejects.toBeInstanceOf(MenuValidationError);
    expect(mockPrisma.menuItem.create).not.toHaveBeenCalled();
  });

  it("rejects an add-on with a negative priceCents (Req 2.8)", async () => {
    await expect(
      createMenuItem(
        validInput({ addOns: [{ name: "Extra shot", priceCents: -100 }] })
      )
    ).rejects.toBeInstanceOf(MenuValidationError);
    expect(mockPrisma.menuItem.create).not.toHaveBeenCalled();
  });

  it("creates a valid item with nested sizes and add-ons", async () => {
    mockPrisma.menuItem.create.mockResolvedValue({ id: "item-1" });

    const result = await createMenuItem(validInput());

    expect(result).toEqual({ id: "item-1" });
    expect(mockPrisma.menuItem.create).toHaveBeenCalledTimes(1);
    const arg = mockPrisma.menuItem.create.mock.calls[0][0];
    expect(arg.data.name).toBe("Latte");
    expect(arg.data.available).toBe(true); // defaulted
    expect(arg.data.sizes.create).toHaveLength(1);
    expect(arg.data.addOns.create).toHaveLength(1);
    expect(arg.include).toEqual({ sizes: true, addOns: true });
  });
});

describe("updateMenuItem validation (Requirements 2.3, 2.7, 2.8)", () => {
  it("allows a partial update with only some fields present", async () => {
    mockPrisma.menuItem.update.mockResolvedValue({ id: "item-1" });

    await updateMenuItem("item-1", { name: "Flat White" });

    expect(mockPrisma.menuItem.update).toHaveBeenCalledTimes(1);
    const arg = mockPrisma.menuItem.update.mock.calls[0][0];
    expect(arg.where).toEqual({ id: "item-1" });
    expect(arg.data.name).toBe("Flat White");
    // Untouched fields are not written.
    expect(arg.data).not.toHaveProperty("basePriceCents");
  });

  it("replaces sizes and add-ons via delete-then-create when provided", async () => {
    mockPrisma.menuItem.update.mockResolvedValue({ id: "item-1" });

    await updateMenuItem("item-1", {
      sizes: [{ name: "Large", priceDeltaCents: 3000 }],
      addOns: [{ name: "Syrup", priceCents: 1500 }],
    });

    const arg = mockPrisma.menuItem.update.mock.calls[0][0];
    expect(arg.data.sizes.deleteMany).toEqual({});
    expect(arg.data.sizes.create).toHaveLength(1);
    expect(arg.data.addOns.deleteMany).toEqual({});
    expect(arg.data.addOns.create[0].available).toBe(true); // defaulted
  });

  it("rejects an invalid partial update without touching the database", async () => {
    await expect(
      updateMenuItem("item-1", { basePriceCents: -5 })
    ).rejects.toBeInstanceOf(MenuValidationError);
    expect(mockPrisma.menuItem.update).not.toHaveBeenCalled();
  });
});

describe("deleteMenuItem cascade (Requirement 2.4)", () => {
  it("delegates to a single prisma delete (schema cascades sizes/add-ons)", async () => {
    mockPrisma.menuItem.delete.mockResolvedValue({ id: "item-1" });

    await deleteMenuItem("item-1");

    expect(mockPrisma.menuItem.delete).toHaveBeenCalledTimes(1);
    expect(mockPrisma.menuItem.delete).toHaveBeenCalledWith({
      where: { id: "item-1" },
    });
  });
});

describe("availability toggles (Requirements 2.5, 2.6)", () => {
  it("toggles a whole item's availability", async () => {
    mockPrisma.menuItem.update.mockResolvedValue({ id: "item-1", available: false });

    await setItemAvailability("item-1", false);

    const arg = mockPrisma.menuItem.update.mock.calls[0][0];
    expect(arg.where).toEqual({ id: "item-1" });
    expect(arg.data).toEqual({ available: false });
  });

  it("toggles a single add-on's availability independently", async () => {
    mockPrisma.menuItemAddOn.update.mockResolvedValue({ id: "addon-1", available: false });

    await setAddOnAvailability("addon-1", false);

    expect(mockPrisma.menuItemAddOn.update).toHaveBeenCalledWith({
      where: { id: "addon-1" },
      data: { available: false },
    });
    // The parent item is never updated as part of an add-on toggle.
    expect(mockPrisma.menuItem.update).not.toHaveBeenCalled();
  });
});
