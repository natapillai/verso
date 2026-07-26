import { createHash } from "node:crypto";

/*
  Verification sampling, from specs/domain.md.

  The hole this closes: if nobody ever checks an auto accepted field, accuracy is
  measured only over the fields the model already knew it was unsure about, which
  is the easy half. A random slice of the auto accepted fields is shown for
  verification anyway, so the number means something.

  The draw is a seeded function of the field's identity rather than Math.random()
  for two reasons the spec names. A reviewer never sees a field appear and vanish
  between reloads, and the sampling is reproducible in tests.
*/

/**
 * The identity a sampling decision is keyed on.
 *
 * specs/domain.md says "field id". A field row's uuid does not exist until it is
 * first inserted, so a first extraction could not compute it, and re extraction
 * would then have to reuse the old row's id to stay stable. The document id plus
 * the field name is the same identity, is known before the row exists, and is
 * stable across reloads and re extractions, which is the property the spec is
 * protecting.
 *
 * The separator matters: without it, ("a", "bc") and ("ab", "c") would collide.
 */
export function sampleKey(documentId: string, fieldName: string): string {
  return `${documentId}:${fieldName}`;
}

/**
 * A uniform value in [0, 1) derived from the key. Deterministic across
 * processes and runs, which `Math.random()` and any seeded-at-startup PRNG
 * would not be.
 */
function unitInterval(key: string): number {
  const digest = createHash("sha256").update(key).digest();
  // Four bytes give 2^32 buckets, far more than the sample rates in play.
  return digest.readUInt32BE(0) / 2 ** 32;
}

/**
 * Whether an auto accepted field should be promoted to `sampled`.
 *
 * Strictly less than the rate, so a rate of zero never samples. The unit value
 * is always below one, so a rate of one always samples.
 */
export function shouldSample(key: string, rate: number): boolean {
  return unitInterval(key) < rate;
}
