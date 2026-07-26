import { describe, expect, it } from "vitest";
import { ExtractedSchema, FIELD_NAMES } from "./fields";

/*
  Non negotiable 2 in CLAUDE.md: model output is never trusted, and "a parse
  failure is a failure, not something to repair". Every test here asserts
  rejection. None of them assert that a malformed payload was patched up, because
  a model that skips or duplicates a field is a model that has stopped following
  the contract, and specs/extraction.md says you want to know.
*/

function field(name: string, over: Record<string, unknown> = {}) {
  return {
    name,
    value: "x",
    confidence: 0.9,
    box: { x0: 0, y0: 0, x1: 1, y1: 1 },
    ...over,
  };
}

const wellFormed = FIELD_NAMES.map((name) => field(name));

describe("ExtractedSchema", () => {
  it("accepts exactly eight fields in the fixed order", () => {
    expect(ExtractedSchema.safeParse({ fields: wellFormed }).success).toBe(true);
  });

  it("rejects seven fields", () => {
    const result = ExtractedSchema.safeParse({ fields: wellFormed.slice(0, 7) });
    expect(result.success).toBe(false);
  });

  it("rejects nine fields", () => {
    const result = ExtractedSchema.safeParse({
      fields: [...wellFormed, field("total")],
    });
    expect(result.success).toBe(false);
  });

  /*
    Eight entries with a duplicate satisfies a naive length check while leaving a
    field unextracted. The schema has to catch it, not the caller.
  */
  it("rejects eight fields containing a duplicate name", () => {
    const withDuplicate = [...wellFormed.slice(0, 7), field("invoice_number")];
    const result = ExtractedSchema.safeParse({ fields: withDuplicate });
    expect(result.success).toBe(false);
  });

  it("rejects the eight names in the wrong order", () => {
    const reordered = [wellFormed[1], wellFormed[0], ...wellFormed.slice(2)];
    const result = ExtractedSchema.safeParse({ fields: reordered });
    expect(result.success).toBe(false);
  });

  it("rejects a name outside the field set", () => {
    const withUnknown = [...wellFormed.slice(0, 7), field("line_items")];
    expect(ExtractedSchema.safeParse({ fields: withUnknown }).success).toBe(false);
  });

  it("rejects a confidence above one", () => {
    const bad = [field(FIELD_NAMES[0], { confidence: 1.2 }), ...wellFormed.slice(1)];
    expect(ExtractedSchema.safeParse({ fields: bad }).success).toBe(false);
  });

  it("rejects a negative confidence", () => {
    const bad = [field(FIELD_NAMES[0], { confidence: -0.1 }), ...wellFormed.slice(1)];
    expect(ExtractedSchema.safeParse({ fields: bad }).success).toBe(false);
  });

  /*
    Invariant 6: boxes are normalised zero through one. The database enforces this
    too, but a value that reaches the insert has already been trusted once too
    often.
  */
  it("rejects a box coordinate above one", () => {
    const bad = [
      field(FIELD_NAMES[0], { box: { x0: 0, y0: 0, x1: 1.4, y1: 1 } }),
      ...wellFormed.slice(1),
    ];
    expect(ExtractedSchema.safeParse({ fields: bad }).success).toBe(false);
  });

  it("rejects a box missing a corner", () => {
    const bad = [
      field(FIELD_NAMES[0], { box: { x0: 0, y0: 0, x1: 1 } }),
      ...wellFormed.slice(1),
    ];
    expect(ExtractedSchema.safeParse({ fields: bad }).success).toBe(false);
  });

  /*
    specs/extraction.md: value and box are nullable on purpose. A null value with
    high confidence means the model is sure the field is absent, which is a
    different and useful signal from a null with low confidence.
  */
  it("accepts a null value with high confidence", () => {
    const absent = [
      field(FIELD_NAMES[0], { value: null, confidence: 0.98, box: null }),
      ...wellFormed.slice(1),
    ];
    expect(ExtractedSchema.safeParse({ fields: absent }).success).toBe(true);
  });

  it("accepts a null box on a non null value, which is allowed but rare", () => {
    const noBox = [field(FIELD_NAMES[0], { box: null }), ...wellFormed.slice(1)];
    expect(ExtractedSchema.safeParse({ fields: noBox }).success).toBe(true);
  });

  it("rejects a missing fields key entirely", () => {
    expect(ExtractedSchema.safeParse({}).success).toBe(false);
  });
});

describe("FIELD_NAMES", () => {
  it("is the eight scalar fields from specs/product.md, in the spec's order", () => {
    expect(FIELD_NAMES).toEqual([
      "invoice_number",
      "issue_date",
      "due_date",
      "supplier_name",
      "supplier_tax_id",
      "currency",
      "subtotal",
      "total",
    ]);
  });
});
