import type { FieldStatus } from "./fields";

/*
  The tuning knobs, in one place. specs/domain.md: both are displayed in the
  interface and neither is hardcoded anywhere else.

  These are the values used when an extraction runs. They are copied onto the
  extraction row at that moment, because invariant 5 says tuning them later must
  not retroactively change what counted as auto accepted.
*/

/**
 * Confidence at or above this is accepted without a reviewer looking.
 *
 * specs/extraction.md is blunt that this is a starting guess, not a derived
 * value: confidence from a language model is not a probability. The sampling
 * below is what turns it into a measured number over time.
 */
export const AUTO_ACCEPT_THRESHOLD = 0.85;

/** Share of auto accepted fields drawn for verification anyway. */
export const SAMPLE_RATE = 0.1;

/**
 * The manual baseline the time saved figure multiplies by. Rendered next to the
 * result so a reader can disagree with the assumption rather than the
 * arithmetic. Unused until the accuracy view, but specs/domain.md says it lives
 * beside the thresholds.
 */
export const MANUAL_SECONDS_PER_FIELD = 15;

/**
 * Where a freshly extracted value lands before any sampling decision.
 * At the threshold counts as accepted, per specs/domain.md.
 */
export function classify(
  confidence: number,
  threshold: number,
): Extract<FieldStatus, "auto_accepted" | "needs_review"> {
  return confidence >= threshold ? "auto_accepted" : "needs_review";
}
