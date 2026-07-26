import type { FieldName, FieldStatus } from "./fields";

/*
  Invariant 2 in specs/domain.md: every value change writes a correction row in
  the same transaction as the field update.

  The transaction is src/server's job. What lives here is the reason the
  invariant is hard to break: the field update and the correction row are
  produced by one call and returned together, so there is no way to write one
  without having built the other. The same split that made invariant 1 provable
  without a database in slice 02.
*/

export type ReviewableField = {
  id: string;
  name: FieldName;
  value: string | null;
  status: FieldStatus;
  /** The extraction that produced the current value. Null if never extracted. */
  extractionId: string | null;
};

export type CorrectionRow = {
  fieldId: string;
  previousValue: string | null;
  newValue: string | null;
  reviewerId: string;
  /** The extraction this correction disagreed with. */
  extractionId: string | null;
};

export type CorrectionPlan = {
  field: { id: string; value: string | null; status: Extract<FieldStatus, "corrected"> };
  correction: CorrectionRow;
};

export type ConfirmationPlan = {
  field: { id: string; value: string | null; status: Extract<FieldStatus, "confirmed"> };
};

/** A blank correction clears the value rather than storing an empty string. */
function normalise(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * A reviewer disagreed with a value.
 *
 * Throws when nothing actually changed. A correction row that records no change
 * would count against the model in field accuracy while the reviewer was in fact
 * agreeing, which quietly corrupts the number the whole product is built to
 * report. That case is a confirmation, and the caller is told so.
 */
export function planCorrection(
  field: ReviewableField,
  newValue: string | null,
  reviewerId: string,
): CorrectionPlan {
  const next = normalise(newValue);
  const previous = normalise(field.value);

  if (next === previous) {
    throw new Error(
      `Field ${field.name} was not changed. Confirm it instead of correcting it.`,
    );
  }

  return {
    field: { id: field.id, value: next, status: "corrected" },
    correction: {
      fieldId: field.id,
      previousValue: previous,
      newValue: next,
      reviewerId,
      extractionId: field.extractionId,
    },
  };
}

/**
 * A reviewer agreed with a value.
 *
 * No correction row: confirming is not a value change. Field accuracy is
 * confirmed over confirmed plus corrected, so writing a correction here would
 * corrupt both halves of the fraction at once.
 */
export function planConfirmation(field: ReviewableField): ConfirmationPlan {
  if (field.status === "corrected") {
    throw new Error(
      `Field ${field.name} was corrected. Confirming it would drop that correction from the accuracy numbers.`,
    );
  }

  return { field: { id: field.id, value: field.value, status: "confirmed" } };
}
