import { describe, it, expect } from "vitest";
import { co2eAvoidedKg, LAST_MILE_KG_PER_PARCEL, LINEHAUL_KG_PER_PARCEL_KM } from "../src/co2.js";

describe("co2eAvoidedKg (methodology v0)", () => {
  it("computes last-mile + per-km line-haul share", () => {
    const km = 180; // ~London–Birmingham rail distance
    const expected = LAST_MILE_KG_PER_PARCEL + km * LINEHAUL_KG_PER_PARCEL_KM;
    expect(co2eAvoidedKg(km)).toBeCloseTo(expected, 3);
  });

  it("rounds to gram precision", () => {
    const v = co2eAvoidedKg(180);
    expect(v).toBe(Math.round(v * 1000) / 1000);
  });

  it("is in a sane order of magnitude (100g–2kg for UK intercity)", () => {
    expect(co2eAvoidedKg(50)).toBeGreaterThan(0.1);
    expect(co2eAvoidedKg(600)).toBeLessThan(2);
  });

  it("rejects non-positive or non-finite distances", () => {
    expect(() => co2eAvoidedKg(0)).toThrow();
    expect(() => co2eAvoidedKg(-5)).toThrow();
    expect(() => co2eAvoidedKg(NaN)).toThrow();
  });
});
