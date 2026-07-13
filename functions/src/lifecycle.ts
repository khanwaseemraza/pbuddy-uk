/**
 * Shipment lifecycle rules beyond the happy path: cancellation and
 * no-show/overdue detection. Pure module (see ADR 0003 pattern).
 *
 * Windows reuse the code TTLs (codes.ts): a shipment is stale exactly when
 * the code that would move it forward has expired.
 */

import { CODE_TTL_HOURS } from "./codes.js";
import type { CustodyState } from "./custody.js";

const HOUR_MS = 3_600_000;

/** Fee retained by the platform to pay shop A when cancelling after deposit. */
export const CANCEL_AFTER_DEPOSIT_FEE_GBP = 1.0;

export type CancelCheck =
  | { ok: true; refund: "full" | "minus_handling"; note: string }
  | { ok: false; reason: string };

/**
 * Sender-initiated cancellation, per state (PRODUCT.md edge cases):
 * CREATED   -> full refund, nothing has happened yet.
 * DEPOSITED -> refund minus shop handling; sender collects from shop A.
 * COLLECTED/ARRIVED -> too late: parcel is moving or deliverable.
 */
export function canCancel(state: CustodyState): CancelCheck {
  switch (state) {
    case "CREATED":
      return { ok: true, refund: "full", note: "no custody taken; codes voided" };
    case "DEPOSITED":
      return {
        ok: true,
        refund: "minus_handling",
        note: "sender collects from shop A with a reissued pickup-style code",
      };
    case "COLLECTED":
      return { ok: false, reason: "parcel is in transit with traveller" };
    case "ARRIVED":
      return { ok: false, reason: "parcel is at destination; recipient can collect" };
    case "DELIVERED":
      return { ok: false, reason: "already delivered" };
  }
}

export type StaleKind =
  | "none"
  | "never_deposited" // CREATED, deposit window passed -> void shipment, refund
  | "no_traveller" // DEPOSITED, collection window passed -> re-match or return
  | "not_collected"; // ARRIVED, pickup window passed -> return-leg flow

/**
 * Detect a stalled shipment. `stateEnteredAt` is the timestamp of the last
 * custody event (or creation). Driven by a scheduled function sweep.
 */
export function staleness(state: CustodyState, stateEnteredAt: Date, now: Date): StaleKind {
  const ageHours = (now.getTime() - stateEnteredAt.getTime()) / HOUR_MS;
  switch (state) {
    case "CREATED":
      return ageHours > CODE_TTL_HOURS.deposit ? "never_deposited" : "none";
    case "DEPOSITED":
      return ageHours > CODE_TTL_HOURS.collection ? "no_traveller" : "none";
    case "ARRIVED":
      return ageHours > CODE_TTL_HOURS.pickup ? "not_collected" : "none";
    default:
      // COLLECTED has journey-specific ETAs (traveller's train), handled by
      // journey monitoring, not a fixed TTL. DELIVERED is terminal.
      return "none";
  }
}
