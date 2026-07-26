import { describe, expect, it } from "vitest";
import { planCorrection, planConfirmation, type ReviewableField } from "./corrections";

/*
  Invariant 2 in specs/domain.md: every value change writes a correction row in
  the same transaction as the field update. If the correction insert fails, the
  update rolls back. The correction carries the previous value, the new value,
  the actor, and the extraction id it disagreed with.

  The transaction itself belongs to src/server. What is testable without a
  database — and what actually carries the invariant — is that the field update
  and the correction row are produced together, from one call, and can never be
  built independently of each other.
*/

const REVIEWER = "22222222-2222-4222-8222-222222222222";
const EXTRACTION = "33333333-3333-4333-8333-333333333333";

const field: ReviewableField = {
  id: "44444444-4444-4444-8444-444444444444",
  name: "total",
  value: "1463.20",
  status: "needs_review",
  extractionId: EXTRACTION,
};

describe("planCorrection", () => {
  it("returns the field update and its correction row together", () => {
    const plan = planCorrection(field, "1500.00", REVIEWER);

    expect(plan.field.value).toBe("1500.00");
    expect(plan.field.status).toBe("corrected");
    expect(plan.correction).toBeDefined();
  });

  it("records what the value used to be", () => {
    const plan = planCorrection(field, "1500.00", REVIEWER);
    expect(plan.correction.previousValue).toBe("1463.20");
  });

  it("records the new value", () => {
    const plan = planCorrection(field, "1500.00", REVIEWER);
    expect(plan.correction.newValue).toBe("1500.00");
  });

  it("records the actor, so a reload can say who changed it", () => {
    const plan = planCorrection(field, "1500.00", REVIEWER);
    expect(plan.correction.reviewerId).toBe(REVIEWER);
  });

  /*
    The extraction the correction disagreed with is what lets accuracy be
    attributed to a prompt version later. Without it a correction is just a value
    change with no opinion attached.
  */
  it("records the extraction it disagreed with", () => {
    const plan = planCorrection(field, "1500.00", REVIEWER);
    expect(plan.correction.extractionId).toBe(EXTRACTION);
  });

  it("points the correction at the field it belongs to", () => {
    const plan = planCorrection(field, "1500.00", REVIEWER);
    expect(plan.correction.fieldId).toBe(field.id);
  });

  it("handles correcting a field the model left empty", () => {
    const empty = { ...field, value: null };
    const plan = planCorrection(empty, "GB123", REVIEWER);

    expect(plan.correction.previousValue).toBeNull();
    expect(plan.correction.newValue).toBe("GB123");
  });

  it("handles a reviewer clearing a value the model invented", () => {
    const plan = planCorrection(field, null, REVIEWER);

    expect(plan.field.value).toBeNull();
    expect(plan.correction.newValue).toBeNull();
    expect(plan.correction.previousValue).toBe("1463.20");
  });

  it("carries a null extraction id when the field was never extracted", () => {
    const plan = planCorrection({ ...field, extractionId: null }, "x", REVIEWER);
    expect(plan.correction.extractionId).toBeNull();
  });

  /*
    A correction that does not change anything would put a row into the accuracy
    numbers saying the model was wrong when the reviewer agreed with it. That is
    a confirmation, and the caller is told so rather than silently given one.
  */
  it("refuses a correction that does not change the value", () => {
    expect(() => planCorrection(field, "1463.20", REVIEWER)).toThrow();
  });

  it("trims surrounding whitespace before deciding the value changed", () => {
    expect(() => planCorrection(field, "  1463.20  ", REVIEWER)).toThrow();
  });

  it("treats an emptied string as clearing the value, not as no change", () => {
    const plan = planCorrection(field, "   ", REVIEWER);
    expect(plan.field.value).toBeNull();
  });
});

describe("planConfirmation", () => {
  /*
    Confirming is not a value change, so invariant 2 does not apply and no
    correction row is written. Field accuracy counts confirmed against corrected,
    and a confirmation that wrote a correction row would corrupt both halves.
  */
  it("changes only the status and writes no correction", () => {
    const plan = planConfirmation(field);

    expect(plan.field.status).toBe("confirmed");
    expect(plan.field.value).toBe("1463.20");
    expect("correction" in plan).toBe(false);
  });

  it("confirms a sampled field, which is the point of drawing it", () => {
    const plan = planConfirmation({ ...field, status: "sampled" });
    expect(plan.field.status).toBe("confirmed");
  });

  it("confirms an auto_accepted field the reviewer chose to look at anyway", () => {
    const plan = planConfirmation({ ...field, status: "auto_accepted" });
    expect(plan.field.status).toBe("confirmed");
  });

  /*
    Re-confirming something a human already corrected would erase the correction
    from the accuracy numbers without erasing the value, which is the worst of
    both.
  */
  it("refuses to confirm a field that was already corrected", () => {
    expect(() => planConfirmation({ ...field, status: "corrected" })).toThrow();
  });
});
