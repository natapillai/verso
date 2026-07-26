import { describe, expect, it } from "vitest";
import { sampleKey, shouldSample } from "./sampling";

/*
  specs/domain.md: sampling uses "a seeded pseudorandom function of the field id,
  not Math.random()". Two properties follow, and both are load bearing:

    - Determinism, so a reviewer does not watch a field appear and vanish between
      reloads.
    - Uniformity, so the sample rate displayed next to the accuracy figure is the
      rate actually drawn.

  A hash can be perfectly deterministic and badly skewed, so both are tested.
*/

const KEY = sampleKey("doc-abc", "total");

describe("shouldSample determinism", () => {
  it("returns the same answer for the same key every time", () => {
    const first = shouldSample(KEY, 0.5);
    for (let i = 0; i < 100; i += 1) {
      expect(shouldSample(KEY, 0.5)).toBe(first);
    }
  });

  /*
    Both of these assert that a component of the key actually reaches the hash.
    They use enough draws that an all-same result would mean the input is being
    ignored rather than that the coin landed the same way a few times: at p=0.5
    over 50 draws, a false failure is about one in 10^15.
  */
  it("varies with the field name, so the field is part of the draw", () => {
    const decisions = new Set(
      Array.from({ length: 50 }, (_, i) =>
        shouldSample(sampleKey("doc-abc", `field-${i}`), 0.5),
      ),
    );

    expect(decisions).toEqual(new Set([true, false]));
  });

  it("varies with the document id, so the document is part of the draw", () => {
    const decisions = new Set(
      Array.from({ length: 50 }, (_, i) =>
        shouldSample(sampleKey(`doc-${i}`, "total"), 0.5),
      ),
    );

    expect(decisions).toEqual(new Set([true, false]));
  });
});

describe("shouldSample bounds", () => {
  it("never samples at a rate of zero", () => {
    for (let i = 0; i < 500; i += 1) {
      expect(shouldSample(sampleKey("doc", `field-${i}`), 0)).toBe(false);
    }
  });

  it("always samples at a rate of one", () => {
    for (let i = 0; i < 500; i += 1) {
      expect(shouldSample(sampleKey("doc", `field-${i}`), 1)).toBe(true);
    }
  });
});

describe("shouldSample distribution", () => {
  /*
    The default rate is 0.1 and it is displayed in the interface. If the hash
    clusters, the displayed rate becomes a lie. Ten thousand keys is enough to
    catch a badly skewed hash without making the suite slow.
  */
  it("draws close to the requested rate across many keys", () => {
    const total = 10_000;
    let sampled = 0;

    for (let i = 0; i < total; i += 1) {
      if (shouldSample(sampleKey("doc", `field-${i}`), 0.1)) sampled += 1;
    }

    const rate = sampled / total;
    expect(rate).toBeGreaterThan(0.08);
    expect(rate).toBeLessThan(0.12);
  });
});

describe("sampleKey", () => {
  it("is stable for the same document and field", () => {
    expect(sampleKey("doc-abc", "total")).toBe(sampleKey("doc-abc", "total"));
  });

  it("separates documents from fields, so ids cannot collide by concatenation", () => {
    expect(sampleKey("a", "bc")).not.toBe(sampleKey("ab", "c"));
  });
});
