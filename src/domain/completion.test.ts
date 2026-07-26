import { describe, expect, it } from "vitest";
import { FIELD_NAMES, type FieldName, type FieldStatus } from "./fields";
import { canComplete, describeOutstanding } from "./completion";

/*
  Invariant 3 in specs/domain.md: a document cannot be completed while any field
  is needs_review or sampled, and attempting it returns a validation error naming
  the outstanding fields.

  The naming matters as much as the blocking. specs/design.md fixes the copy —
  "Two fields still need you before this one can be completed" — which only works
  if the caller knows which fields and how many.
*/

function statuses(over: Partial<Record<FieldName, FieldStatus>>) {
  return FIELD_NAMES.map((name) => ({
    name,
    status: over[name] ?? ("confirmed" as FieldStatus),
  }));
}

describe("canComplete", () => {
  it("allows completion when every field has been settled by a human", () => {
    expect(canComplete(statuses({})).ok).toBe(true);
  });

  it("allows completion when fields are a mix of confirmed and corrected", () => {
    const result = canComplete(
      statuses({ total: "corrected", currency: "corrected" }),
    );
    expect(result.ok).toBe(true);
  });

  /*
    An auto_accepted field was never shown to the reviewer and never had to be.
    Blocking on it would defeat the whole idea: confidence is per field, and a
    document where seven fields are certain should cost one field of attention.
  */
  it("allows completion with auto_accepted fields, which nobody had to look at", () => {
    expect(canComplete(statuses({ subtotal: "auto_accepted" })).ok).toBe(true);
  });

  it("blocks on a needs_review field", () => {
    const result = canComplete(statuses({ supplier_tax_id: "needs_review" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.outstanding).toEqual(["supplier_tax_id"]);
  });

  /*
    A sampled field was auto accepted and then drawn for verification. It blocks
    too, otherwise the sample is decorative and auto accept precision measures
    nothing.
  */
  it("blocks on a sampled field", () => {
    const result = canComplete(statuses({ currency: "sampled" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.outstanding).toEqual(["currency"]);
  });

  it("names every outstanding field, in the field set's order", () => {
    const result = canComplete(
      statuses({ issue_date: "needs_review", currency: "sampled" }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.outstanding).toEqual(["issue_date", "currency"]);
  });

  it("blocks a document with no fields at all, which has not been extracted", () => {
    expect(canComplete([]).ok).toBe(false);
  });

  it("blocks when fields are missing, rather than completing a partial document", () => {
    const result = canComplete(statuses({}).slice(0, 5));
    expect(result.ok).toBe(false);
  });
});

describe("describeOutstanding", () => {
  /*
    specs/design.md fixes this sentence. It says what happened and what to do
    next, and it never apologises.
  */
  it("uses the spec's wording for two fields", () => {
    expect(describeOutstanding(["issue_date", "currency"])).toBe(
      "Two fields still need you before this one can be completed.",
    );
  });

  it("says one field in the singular", () => {
    expect(describeOutstanding(["currency"])).toBe(
      "One field still needs you before this one can be completed.",
    );
  });

  it("counts in words up to a handful, then falls back to a numeral", () => {
    expect(describeOutstanding(FIELD_NAMES.slice(0, 3))).toContain("Three fields");
    expect(describeOutstanding([...FIELD_NAMES])).toContain("8 fields");
  });
});
