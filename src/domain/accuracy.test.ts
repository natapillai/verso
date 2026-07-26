import { describe, expect, it } from "vitest";
import {
  MIN_TRUSTWORTHY_SAMPLE,
  PRECISION_FLOOR,
  accuracyRatio,
  describePrecision,
  timeSavedSeconds,
} from "./accuracy";

/*
  specs/domain.md: three numbers, and they measure different things. Do not
  average them.

  The failure paths carry more weight here than the happy ones. A number on this
  page that is confidently wrong is worse than no number, because the whole point
  of the product is that accuracy stops being a claim and becomes something you
  can check.
*/

describe("accuracyRatio", () => {
  /*
    The case that matters most. Nobody has reviewed anything yet, so the honest
    answer is "no data", not zero. Zero would read as "the model got everything
    wrong", which is the opposite of the truth and is the kind of number a
    stakeholder acts on.
  */
  it("returns null, not zero, when nothing has been reviewed", () => {
    expect(accuracyRatio(0, 0)).toBeNull();
  });

  it("never returns NaN", () => {
    expect(Number.isNaN(accuracyRatio(0, 0) ?? 0)).toBe(false);
  });

  it("returns zero when every reviewed field was corrected", () => {
    // Distinct from the empty case: this really is a model that got it wrong.
    expect(accuracyRatio(0, 5)).toBe(0);
  });

  it("returns one when every reviewed field was confirmed", () => {
    expect(accuracyRatio(5, 0)).toBe(1);
  });

  it("divides confirmed by confirmed plus corrected", () => {
    expect(accuracyRatio(3, 1)).toBe(0.75);
  });

  it("does not round away a difference the reader would care about", () => {
    expect(accuracyRatio(97, 3)).toBeCloseTo(0.97, 5);
  });
});

describe("timeSavedSeconds", () => {
  it("multiplies untouched fields by the manual baseline", () => {
    expect(timeSavedSeconds(20, 15)).toBe(300);
  });

  it("is zero when nothing was auto accepted", () => {
    expect(timeSavedSeconds(0, 15)).toBe(0);
  });

  /*
    Unlike the ratios, zero here is a real answer rather than missing data: no
    fields went untouched, so no time was saved.
  */
  it("is zero rather than null, because zero is the truth", () => {
    expect(timeSavedSeconds(0, 15)).not.toBeNull();
  });

  it("respects a baseline other than the default", () => {
    expect(timeSavedSeconds(10, 20)).toBe(200);
  });
});

describe("describePrecision", () => {
  /*
    specs/domain.md: "If it drops below roughly 0.97 the threshold is too low and
    the interface should say so plainly rather than leave it to be noticed."
  */
  it("says the threshold is too low when precision falls below the floor", () => {
    const result = describePrecision(0.9, 500);
    expect(result.tone).toBe("threshold-too-low");
    expect(result.message).toContain("threshold");
  });

  it("does not complain at exactly the floor", () => {
    expect(describePrecision(PRECISION_FLOOR, 500).tone).toBe("ok");
  });

  it("does not complain above the floor", () => {
    expect(describePrecision(0.99, 500).tone).toBe("ok");
  });

  /*
    specs/extraction.md: "After a few hundred sampled fields, auto accept
    precision tells you whether 0.85 was too generous." A precision of 1.00 over
    three samples announcing that everything is fine would be worse than useless,
    and a precision of 0.5 over two would raise a false alarm.
  */
  it("says the sample is too small before it says anything about the threshold", () => {
    const result = describePrecision(0.5, 4);
    expect(result.tone).toBe("not-enough-yet");
  });

  it("does not claim everything is fine on a tiny perfect sample", () => {
    expect(describePrecision(1, 3).tone).toBe("not-enough-yet");
  });

  it("starts judging once the sample is large enough", () => {
    expect(describePrecision(0.5, MIN_TRUSTWORTHY_SAMPLE).tone).toBe(
      "threshold-too-low",
    );
  });

  it("reports no data when nothing has been sampled at all", () => {
    const result = describePrecision(null, 0);
    expect(result.tone).toBe("no-data");
    expect(result.message).toContain("Nothing");
  });

  it("reports no data when precision is null even with a count", () => {
    expect(describePrecision(null, 10).tone).toBe("no-data");
  });
});
