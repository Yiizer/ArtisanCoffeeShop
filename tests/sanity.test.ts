import { describe, it, expect } from "vitest";
import fc from "fast-check";

describe("test tooling sanity check", () => {
  it("runs Vitest", () => {
    expect(1 + 1).toBe(2);
  });

  it("runs fast-check property tests", () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer(), (a, b) => {
        // Addition is commutative.
        return a + b === b + a;
      })
    );
  });
});
