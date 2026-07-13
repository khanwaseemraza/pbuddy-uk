import { describe, it, expect } from "vitest";
import { canCancel, staleness } from "../src/lifecycle.js";

const T0 = new Date("2026-07-12T10:00:00Z");
const hours = (h: number) => new Date(T0.getTime() + h * 3_600_000);

describe("cancellation rules", () => {
  it("CREATED cancels with full refund", () => {
    expect(canCancel("CREATED")).toMatchObject({ ok: true, refund: "full" });
  });

  it("DEPOSITED cancels minus shop handling", () => {
    expect(canCancel("DEPOSITED")).toMatchObject({ ok: true, refund: "minus_handling" });
  });

  it("COLLECTED, ARRIVED, DELIVERED cannot cancel", () => {
    expect(canCancel("COLLECTED").ok).toBe(false);
    expect(canCancel("ARRIVED").ok).toBe(false);
    expect(canCancel("DELIVERED").ok).toBe(false);
  });
});

describe("staleness detection", () => {
  it("CREATED goes stale after the 48h deposit window", () => {
    expect(staleness("CREATED", T0, hours(47))).toBe("none");
    expect(staleness("CREATED", T0, hours(49))).toBe("never_deposited");
  });

  it("DEPOSITED goes stale after the 72h collection window", () => {
    expect(staleness("DEPOSITED", T0, hours(71))).toBe("none");
    expect(staleness("DEPOSITED", T0, hours(73))).toBe("no_traveller");
  });

  it("ARRIVED goes stale after the 7-day pickup window", () => {
    expect(staleness("ARRIVED", T0, hours(167))).toBe("none");
    expect(staleness("ARRIVED", T0, hours(169))).toBe("not_collected");
  });

  it("COLLECTED and DELIVERED never TTL-stale", () => {
    expect(staleness("COLLECTED", T0, hours(1000))).toBe("none");
    expect(staleness("DELIVERED", T0, hours(1000))).toBe("none");
  });
});
