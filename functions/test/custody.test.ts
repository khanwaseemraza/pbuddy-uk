import { describe, it, expect } from "vitest";
import { validateTransition, type Actor } from "../src/custody.js";

const shopA: Actor = { kind: "shop", shopId: "shop-a" };
const traveller: Actor = { kind: "traveller", uid: "t-1" };

const base = {
  shipmentId: "s-1",
  codeHash: "abc123",
  photoRef: "photos/s-1/deposit.jpg",
};

describe("custody state machine", () => {
  it("accepts the happy path in order", () => {
    expect(
      validateTransition({ ...base, current: "CREATED", requested: "DEPOSITED", actor: shopA }).ok
    ).toBe(true);
    expect(
      validateTransition({ ...base, current: "DEPOSITED", requested: "COLLECTED", actor: shopA }).ok
    ).toBe(true);
    expect(
      validateTransition({ ...base, current: "COLLECTED", requested: "ARRIVED", actor: shopA }).ok
    ).toBe(true);
    expect(
      validateTransition({ ...base, current: "ARRIVED", requested: "DELIVERED", actor: shopA, photoRef: undefined }).ok
    ).toBe(true);
  });

  it("rejects skipped states", () => {
    const r = validateTransition({ ...base, current: "CREATED", requested: "COLLECTED", actor: shopA });
    expect(r.ok).toBe(false);
  });

  it("rejects backwards transitions", () => {
    const r = validateTransition({ ...base, current: "ARRIVED", requested: "COLLECTED", actor: shopA });
    expect(r.ok).toBe(false);
  });

  it("rejects transitions after DELIVERED", () => {
    const r = validateTransition({ ...base, current: "DELIVERED", requested: "DELIVERED", actor: shopA });
    expect(r.ok).toBe(false);
  });

  it("rejects non-shop actors scanning", () => {
    const r = validateTransition({ ...base, current: "CREATED", requested: "DEPOSITED", actor: traveller });
    expect(r.ok).toBe(false);
  });

  it("requires a photo where custody changes hands", () => {
    const r = validateTransition({
      ...base,
      photoRef: undefined,
      current: "CREATED",
      requested: "DEPOSITED",
      actor: shopA,
    });
    expect(r.ok).toBe(false);
  });

  // TODO: code expiry, single-use codes, no-show windows — as custody.ts grows.
});
