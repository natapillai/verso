/*
  The accuracy maths, from specs/domain.md.

  Three numbers that measure different things and must not be averaged. What
  lives here is only the arithmetic and the judgement about when a number is
  worth trusting; the counts themselves come from the queries in
  src/server/accuracy.ts, one per number, documented in docs/architecture.md.
*/

/**
 * Below this, specs/domain.md says the threshold is too low and the interface
 * should say so plainly rather than leave it to be noticed.
 */
export const PRECISION_FLOOR = 0.97;

/**
 * How many sampled fields before precision means anything.
 *
 * specs/extraction.md: "After a few hundred sampled fields, auto accept
 * precision tells you whether 0.85 was too generous." Below that, the number is
 * noise in both directions — a perfect score over three samples is not evidence
 * the threshold is safe, and one bad draw is not evidence it is broken.
 */
export const MIN_TRUSTWORTHY_SAMPLE = 30;

/**
 * confirmed / (confirmed + corrected).
 *
 * Null when nobody has reviewed anything, because zero would read as "the model
 * got everything wrong" when the truth is "nobody has looked yet". Those are
 * opposite conclusions and a reader acts on them differently.
 */
export function accuracyRatio(confirmed: number, corrected: number): number | null {
  const reviewed = confirmed + corrected;
  return reviewed === 0 ? null : confirmed / reviewed;
}

/**
 * count(auto_accepted and never sampled) * MANUAL_SECONDS_PER_FIELD.
 *
 * Zero here is a real answer rather than missing data: no field went untouched,
 * so no time was saved. The baseline is passed in so it stays defined once, in
 * src/domain/thresholds.ts, and is rendered beside the result — a reader should
 * be able to disagree with the assumption rather than the arithmetic.
 */
export function timeSavedSeconds(
  untouchedFields: number,
  secondsPerField: number,
): number {
  return untouchedFields * secondsPerField;
}

export type PrecisionVerdict = {
  tone: "no-data" | "not-enough-yet" | "threshold-too-low" | "ok";
  message: string;
};

/**
 * What to say about auto accept precision.
 *
 * This is the number that matters: it answers whether the fields nobody checked
 * were safe to not check. The order of the checks is deliberate — sample size is
 * considered before the value, because judging a threshold on four draws would
 * be the same false confidence the sampling exists to prevent.
 */
export function describePrecision(
  precision: number | null,
  sampleSize: number,
): PrecisionVerdict {
  if (precision === null || sampleSize === 0) {
    return {
      tone: "no-data",
      message: "Nothing has been sampled yet, so there is nothing to check.",
    };
  }

  if (sampleSize < MIN_TRUSTWORTHY_SAMPLE) {
    return {
      tone: "not-enough-yet",
      message: `Too few samples to judge the threshold. ${sampleSize} of about ${MIN_TRUSTWORTHY_SAMPLE} needed.`,
    };
  }

  if (precision < PRECISION_FLOOR) {
    return {
      tone: "threshold-too-low",
      message: `The threshold is too low. Fields nobody checked are being accepted wrongly at this rate.`,
    };
  }

  return {
    tone: "ok",
    message: "Fields accepted without review are holding up.",
  };
}
