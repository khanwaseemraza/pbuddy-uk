import { describe, it, expect } from "vitest";
import { issueCode, verifyCode, hashCode, generatePlaintext, CODE_TTL_HOURS } from "../src/codes.js";

const NOW = new Date("2026-07-12T10:00:00Z");
const hours = (h: number) => new Date(NOW.getTime() + h * 3_600_000);

describe("code generation", () => {
  it("issues 6-digit codes with purpose-specific expiry", () => {
    const { plaintext, record } = issueCode("s-1", "deposit", NOW);
    expect(plaintext).toMatch(/^\d{6}$/);
    expect(record.expiresAt).toEqual(hours(CODE_TTL_HOURS.deposit));
    expect(record.hash).toBe(hashCode("s-1", "deposit", plaintext));
    expect(record.usedAt).toBeUndefined();
  });

  it("generates leading-zero codes as 6 chars", () => {
    for (let i = 0; i < 200; i++) {
      expect(generatePlaintext()).toHaveLength(6);
    }
  });
});

describe("code verification", () => {
  const issued = issueCode("s-1", "collection", NOW);

  const base = {
    record: issued.record,
    presented: issued.plaintext,
    purpose: "collection" as const,
    shipmentId: "s-1",
    now: hours(1),
  };

  it("accepts a valid, fresh, unused code", () => {
    expect(verifyCode(base)).toEqual({ ok: true });
  });

  it("rejects the wrong code value", () => {
    const wrong = issued.plaintext === "000000" ? "000001" : "000000";
    expect(verifyCode({ ...base, presented: wrong })).toEqual({ ok: false, reason: "wrong_code" });
  });

  it("rejects a code presented for the wrong purpose", () => {
    expect(verifyCode({ ...base, purpose: "pickup" })).toEqual({ ok: false, reason: "wrong_purpose" });
  });

  it("rejects a code bound to another shipment", () => {
    expect(verifyCode({ ...base, shipmentId: "s-2" })).toEqual({ ok: false, reason: "wrong_purpose" });
  });

  it("rejects an expired code (collection TTL is 72h)", () => {
    expect(verifyCode({ ...base, now: hours(73) })).toEqual({ ok: false, reason: "expired" });
  });

  it("accepts at one minute before expiry", () => {
    expect(verifyCode({ ...base, now: new Date(issued.record.expiresAt.getTime() - 60_000) })).toEqual({ ok: true });
  });

  it("rejects an already-used code", () => {
    const used = { ...issued.record, usedAt: hours(1) };
    expect(verifyCode({ ...base, record: used, now: hours(2) })).toEqual({
      ok: false,
      reason: "already_used",
    });
  });

  it("hashes are shipment- and purpose-scoped (no cross-shipment replay)", () => {
    const a = hashCode("s-1", "deposit", "123456");
    const b = hashCode("s-2", "deposit", "123456");
    const c = hashCode("s-1", "pickup", "123456");
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
  });
});
