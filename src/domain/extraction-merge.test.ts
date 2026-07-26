import { describe, expect, it } from "vitest";
import { FIELD_NAMES, type FieldName } from "./fields";
import { planFieldUpdates, type ExistingField } from "./extraction-merge";
import type { ExtractedField } from "./fields";

/*
  Invariant 1 in specs/domain.md. This is the spine of the product: every accuracy
  number is only meaningful because extraction cannot quietly overwrite what a
  human decided. TASKS.md says to write this test first, so it is the first file
  in the slice.

  These are pure function tests. There is no database here on purpose, so they
  also run in the `degraded` CI job with no key and no network.
*/

const DOCUMENT_ID = "11111111-1111-4111-8111-111111111111";

/** A full model result: every field present, all of it confidently different. */
function modelResult(overrides: Partial<Record<FieldName, string>> = {}) {
  return FIELD_NAMES.map<ExtractedField>((name) => ({
    name,
    value: overrides[name] ?? `model-${name}`,
    confidence: 0.99,
    box: { x0: 0.1, y0: 0.1, x1: 0.2, y1: 0.2 },
  }));
}

function existing(
  statuses: Partial<Record<FieldName, ExistingField["status"]>>,
): ExistingField[] {
  return FIELD_NAMES.map((name) => ({
    name,
    status: statuses[name] ?? "auto_accepted",
    value: `human-${name}`,
  }));
}

describe("planFieldUpdates, invariant 1", () => {
  it("does not plan a write for a field a human corrected", () => {
    const plan = planFieldUpdates({
      documentId: DOCUMENT_ID,
      existing: existing({ total: "corrected" }),
      extracted: modelResult(),
      threshold: 0.85,
      sampleRate: 0,
    });

    expect(plan.map((f) => f.name)).not.toContain("total");
  });

  it("does not plan a write for a field a human confirmed", () => {
    const plan = planFieldUpdates({
      documentId: DOCUMENT_ID,
      existing: existing({ supplier_name: "confirmed" }),
      extracted: modelResult(),
      threshold: 0.85,
      sampleRate: 0,
    });

    expect(plan.map((f) => f.name)).not.toContain("supplier_name");
  });

  it("leaves the six untouched fields writable when two are human held", () => {
    const plan = planFieldUpdates({
      documentId: DOCUMENT_ID,
      existing: existing({ total: "corrected", supplier_name: "confirmed" }),
      extracted: modelResult(),
      threshold: 0.85,
      sampleRate: 0,
    });

    expect(plan).toHaveLength(6);
    expect(plan.map((f) => f.name).sort()).toEqual(
      FIELD_NAMES.filter((n) => n !== "total" && n !== "supplier_name").sort(),
    );
  });

  /*
    The test above proves the names are absent from the plan. This one proves the
    thing that actually matters to a reviewer: the value they typed is still the
    value. A plan that skipped the name but returned the model's value elsewhere
    would pass the first test and lose the correction.
  */
  it("keeps the human's value, not the model's, for a corrected field", () => {
    const plan = planFieldUpdates({
      documentId: DOCUMENT_ID,
      existing: existing({ total: "corrected" }),
      extracted: modelResult({ total: "9999.99" }),
      threshold: 0.85,
      sampleRate: 0,
    });

    const totalWrite = plan.find((f) => f.name === "total");
    expect(totalWrite).toBeUndefined();
    // Nothing in the plan carries the model's total, under any field name.
    expect(plan.map((f) => f.value)).not.toContain("9999.99");
  });

  /*
    The invariant is one directional. A planner that returned an empty list would
    pass every test above and break the product, so assert the positive case too.
  */
  it("does overwrite auto_accepted and needs_review fields", () => {
    const plan = planFieldUpdates({
      documentId: DOCUMENT_ID,
      existing: existing({
        invoice_number: "auto_accepted",
        issue_date: "needs_review",
      }),
      extracted: modelResult(),
      threshold: 0.85,
      sampleRate: 0,
    });

    expect(plan.find((f) => f.name === "invoice_number")?.value).toBe(
      "model-invoice_number",
    );
    expect(plan.find((f) => f.name === "issue_date")?.value).toBe(
      "model-issue_date",
    );
  });

  /*
    specs/domain.md invariant 1 names a closed allowlist: a re extraction "only
    populates fields whose status is auto_accepted or needs_review". `sampled` is
    not in it, so a sampled field is preserved even though no human has looked at
    it yet. This also protects the drawn sample from being silently replaced
    between the moment it was drawn and the moment the reviewer sees it.
  */
  it("preserves a sampled field, which is not in the allowlist", () => {
    const plan = planFieldUpdates({
      documentId: DOCUMENT_ID,
      existing: existing({ currency: "sampled" }),
      extracted: modelResult(),
      threshold: 0.85,
      sampleRate: 0,
    });

    expect(plan.map((f) => f.name)).not.toContain("currency");
  });

  it("plans all eight fields on a first extraction, when nothing exists yet", () => {
    const plan = planFieldUpdates({
      documentId: DOCUMENT_ID,
      existing: [],
      extracted: modelResult(),
      threshold: 0.85,
      sampleRate: 0,
    });

    expect(plan).toHaveLength(8);
    expect(plan.map((f) => f.name).sort()).toEqual([...FIELD_NAMES].sort());
  });

  it("plans nothing when a human has touched every field", () => {
    const allHeld = FIELD_NAMES.reduce<
      Partial<Record<FieldName, ExistingField["status"]>>
    >((acc, name) => ({ ...acc, [name]: "confirmed" }), {});

    const plan = planFieldUpdates({
      documentId: DOCUMENT_ID,
      existing: existing(allHeld),
      extracted: modelResult(),
      threshold: 0.85,
      sampleRate: 0,
    });

    expect(plan).toEqual([]);
  });
});

describe("planFieldUpdates, status assignment", () => {
  it("assigns needs_review below the threshold and auto_accepted at or above it", () => {
    const extracted = modelResult().map((f, i) => ({
      ...f,
      confidence: i === 0 ? 0.5 : 0.9,
    }));

    const plan = planFieldUpdates({
      documentId: DOCUMENT_ID,
      existing: [],
      extracted,
      threshold: 0.85,
      sampleRate: 0,
    });

    expect(plan[0]?.status).toBe("needs_review");
    expect(plan[1]?.status).toBe("auto_accepted");
  });

  it("promotes auto_accepted fields to sampled when the sample rate is one", () => {
    const plan = planFieldUpdates({
      documentId: DOCUMENT_ID,
      existing: [],
      extracted: modelResult(),
      threshold: 0.85,
      sampleRate: 1,
    });

    expect(plan.every((f) => f.status === "sampled")).toBe(true);
  });

  it("never promotes a needs_review field to sampled", () => {
    const extracted = modelResult().map((f) => ({ ...f, confidence: 0.1 }));

    const plan = planFieldUpdates({
      documentId: DOCUMENT_ID,
      existing: [],
      extracted,
      threshold: 0.85,
      sampleRate: 1,
    });

    expect(plan.every((f) => f.status === "needs_review")).toBe(true);
  });

  it("samples the same fields on a repeated call, so a reviewer sees a stable set", () => {
    const args = {
      documentId: DOCUMENT_ID,
      existing: [],
      extracted: modelResult(),
      threshold: 0.85,
      sampleRate: 0.5,
    } as const;

    const first = planFieldUpdates(args).map((f) => f.status);
    const second = planFieldUpdates(args).map((f) => f.status);

    expect(first).toEqual(second);
  });
});
