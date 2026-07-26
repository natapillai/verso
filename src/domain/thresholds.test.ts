import { describe, expect, it } from "vitest";
import {
  AUTO_ACCEPT_THRESHOLD,
  MANUAL_SECONDS_PER_FIELD,
  SAMPLE_RATE,
  classify,
} from "./thresholds";

describe("classify", () => {
  /*
    specs/domain.md: "confidence >= threshold ▶ auto_accepted". At is accepted,
    not just above. Getting this boundary wrong shifts every accuracy number in
    the product by whatever sits exactly on the line.
  */
  it("auto accepts a confidence exactly at the threshold", () => {
    expect(classify(0.85, 0.85)).toBe("auto_accepted");
  });

  it("sends a confidence just below the threshold to review", () => {
    expect(classify(0.8499, 0.85)).toBe("needs_review");
  });

  it("auto accepts full confidence", () => {
    expect(classify(1, 0.85)).toBe("auto_accepted");
  });

  /*
    The fallback extractor stamps everything it produces with confidence zero, so
    this is the path that guarantees a degraded document reaches a reviewer with
    every field flagged rather than silently accepted.
  */
  it("sends confidence zero to review, which is what the fallback produces", () => {
    expect(classify(0, 0.85)).toBe("needs_review");
  });

  it("respects a threshold other than the default", () => {
    expect(classify(0.5, 0.4)).toBe("auto_accepted");
    expect(classify(0.5, 0.6)).toBe("needs_review");
  });
});

describe("constants", () => {
  it("holds the defaults specs/domain.md fixes", () => {
    expect(AUTO_ACCEPT_THRESHOLD).toBe(0.85);
    expect(SAMPLE_RATE).toBe(0.1);
    expect(MANUAL_SECONDS_PER_FIELD).toBe(15);
  });
});
