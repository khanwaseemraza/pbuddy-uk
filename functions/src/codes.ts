/**
 * Single-use handoff codes.
 *
 * Each custody transition is authorised by presenting a code (QR or 6-digit
 * manual entry — ADR 0002 makes manual entry first-class). Codes are:
 *  - shipment-bound and purpose-bound (a deposit code cannot collect)
 *  - single-use (usedAt is set atomically by the transition function)
 *  - expiring (windows per purpose, PRODUCT.md)
 *  - stored hashed; the plaintext exists only on the holder's device.
 *
 * Pure module: callers (Cloud Functions) persist CodeRecord in Firestore
 * and pass current time in — nothing here reads clocks or databases.
 */

import { createHash, randomInt } from "node:crypto";

export type CodePurpose = "deposit" | "collection" | "drop" | "pickup";

/** Expiry windows in hours, from issue. See PRODUCT.md. */
export const CODE_TTL_HOURS: Record<CodePurpose, number> = {
  deposit: 48, // sender must reach shop A within 2 days
  collection: 72, // traveller's pickup window at shop A
  drop: 72, // traveller's drop window at shop B
  pickup: 7 * 24, // recipient has a week to collect
};

export interface CodeRecord {
  shipmentId: string;
  purpose: CodePurpose;
  /** sha256 hex of `${shipmentId}:${purpose}:${plaintext}` */
  hash: string;
  issuedAt: Date;
  expiresAt: Date;
  /** Set exactly once, by the custody transition that consumed the code. */
  usedAt?: Date;
}

export function hashCode(shipmentId: string, purpose: CodePurpose, plaintext: string): string {
  return createHash("sha256").update(`${shipmentId}:${purpose}:${plaintext}`).digest("hex");
}

/** 6 digits, leading zeros allowed, crypto-random. */
export function generatePlaintext(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function issueCode(
  shipmentId: string,
  purpose: CodePurpose,
  now: Date
): { plaintext: string; record: CodeRecord } {
  const plaintext = generatePlaintext();
  return {
    plaintext,
    record: {
      shipmentId,
      purpose,
      hash: hashCode(shipmentId, purpose, plaintext),
      issuedAt: now,
      expiresAt: new Date(now.getTime() + CODE_TTL_HOURS[purpose] * 3_600_000),
    },
  };
}

export type CodeCheck =
  | { ok: true }
  | { ok: false; reason: "wrong_code" | "wrong_purpose" | "expired" | "already_used" };

export function verifyCode(params: {
  record: CodeRecord;
  presented: string;
  purpose: CodePurpose;
  shipmentId: string;
  now: Date;
}): CodeCheck {
  const { record, presented, purpose, shipmentId, now } = params;

  // Purpose/shipment mismatch is checked before the hash so a valid deposit
  // code scanned at the wrong step yields a helpful (loggable) reason.
  if (record.purpose !== purpose || record.shipmentId !== shipmentId) {
    return { ok: false, reason: "wrong_purpose" };
  }
  if (record.usedAt) {
    return { ok: false, reason: "already_used" };
  }
  if (now.getTime() > record.expiresAt.getTime()) {
    return { ok: false, reason: "expired" };
  }
  if (hashCode(shipmentId, purpose, presented) !== record.hash) {
    return { ok: false, reason: "wrong_code" };
  }
  return { ok: true };
}
