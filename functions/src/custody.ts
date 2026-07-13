/**
 * The custody state machine — the core of pbuddy.
 *
 * Pure module: no Firebase imports. Cloud Functions call into this; tests
 * exercise it directly. See PRODUCT.md for the protocol and ADR 0003 for
 * why custody is server-authoritative and append-only.
 */

export type CustodyState =
  | "CREATED"    // sender declared shipment, holds deposit code
  | "DEPOSITED"  // shop A scanned deposit code, parcel at counter
  | "COLLECTED"  // shop A scanned traveller's collection code
  | "ARRIVED"    // shop B scanned traveller's drop code
  | "DELIVERED"; // shop B scanned recipient's pickup code

export type Actor =
  | { kind: "sender"; uid: string }
  | { kind: "traveller"; uid: string }
  | { kind: "shop"; shopId: string };

export interface CustodyEvent {
  shipmentId: string;
  from: CustodyState;
  to: CustodyState;
  actor: Actor;
  /** Server timestamp, never client-supplied. */
  at: Date;
  geo?: { lat: number; lng: number };
  photoRef?: string;
  /** Hash of the single-use code presented, for audit. */
  codeHash: string;
}

/** Legal transitions, in protocol order. Anything else is rejected. */
const TRANSITIONS: Record<CustodyState, CustodyState | null> = {
  CREATED: "DEPOSITED",
  DEPOSITED: "COLLECTED",
  COLLECTED: "ARRIVED",
  ARRIVED: "DELIVERED",
  DELIVERED: null,
};

/** Which actor kind may perform each transition (the scanner, per PRODUCT.md). */
const ALLOWED_ACTOR: Record<Exclude<CustodyState, "CREATED">, Actor["kind"]> = {
  DEPOSITED: "shop",
  COLLECTED: "shop",
  ARRIVED: "shop",
  DELIVERED: "shop",
};

export type TransitionResult =
  | { ok: true; event: Omit<CustodyEvent, "at"> }
  | { ok: false; reason: string };

export function validateTransition(params: {
  shipmentId: string;
  current: CustodyState;
  requested: CustodyState;
  actor: Actor;
  codeHash: string;
  photoRef?: string;
  geo?: { lat: number; lng: number };
}): TransitionResult {
  const { current, requested, actor } = params;

  if (TRANSITIONS[current] !== requested) {
    return { ok: false, reason: `illegal transition ${current} -> ${requested}` };
  }
  if (requested === "CREATED") {
    return { ok: false, reason: "CREATED is initial state, not a transition" };
  }
  if (ALLOWED_ACTOR[requested] !== actor.kind) {
    return { ok: false, reason: `actor ${actor.kind} may not perform ${requested}` };
  }
  // Photo is mandatory wherever custody physically changes hands.
  if (requested !== "DELIVERED" && !params.photoRef) {
    return { ok: false, reason: `${requested} requires a photo` };
  }

  return {
    ok: true,
    event: {
      shipmentId: params.shipmentId,
      from: current,
      to: requested,
      actor,
      codeHash: params.codeHash,
      photoRef: params.photoRef,
      geo: params.geo,
    },
  };
}

// TODO (protocol, in order of priority — each lands with tests):
// - no-show timers: DEPOSITED with no COLLECTED in window -> re-match flow
// - return-leg flow for uncollected parcels
// - cancellation rules per state (refund minus shop handling once DEPOSITED)
