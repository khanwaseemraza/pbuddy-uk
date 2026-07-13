/**
 * CO2e-avoided methodology, v0. (ADR 0006)
 *
 * Claim discipline (CMA Green Claims Code): we claim AVOIDED emissions vs.
 * the counterfactual of the same parcel travelling the incumbent van
 * network. The parcel's own marginal emissions on an already-running train
 * are treated as ~zero (we add no vehicle movement).
 *
 * Counterfactual = last-mile van delivery at destination + van line-haul
 * for the intercity distance, per-parcel share.
 *
 * CONSTANTS REQUIRE ANNUAL REVIEW against DEFRA GHG conversion factors and
 * must be cited in the published methodology page before any public claim.
 * Values below are v0 placeholders in the right order of magnitude —
 * replace with cited figures before the pilot reports numbers. [assumed]
 */

/** kg CO2e per parcel for a typical van last-mile drop. [assumed] */
export const LAST_MILE_KG_PER_PARCEL = 0.21;

/**
 * kg CO2e per parcel-km of van line-haul: average van (~0.24 kg CO2e/km,
 * DEFRA-order figure) shared across a conservative 150-parcel load.
 * [assumed]
 */
export const LINEHAUL_KG_PER_PARCEL_KM = 0.24 / 150;

/**
 * Avoided emissions for one delivered shipment, in kg CO2e, rounded to
 * grams. `corridorKm` is the rail-route distance between the two deposit
 * shops' station pair (stored per corridor, not computed per parcel).
 */
export function co2eAvoidedKg(corridorKm: number): number {
  if (!Number.isFinite(corridorKm) || corridorKm <= 0) {
    throw new Error(`corridorKm must be a positive number, got ${corridorKm}`);
  }
  const kg = LAST_MILE_KG_PER_PARCEL + corridorKm * LINEHAUL_KG_PER_PARCEL_KM;
  return Math.round(kg * 1000) / 1000;
}
