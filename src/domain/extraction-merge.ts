import type { Box, ExtractedField, FieldName, FieldStatus } from "./fields";
import { sampleKey, shouldSample } from "./sampling";
import { classify } from "./thresholds";

/*
  Invariant 1, and the reason every accuracy number in the product means
  anything: extraction never overwrites a field a human has touched.

  This is a pure function on purpose. It is the only thing that decides what an
  extraction may write, so the invariant is provable without a database, and it
  stays provable in the `degraded` CI job where there is no database to have.

  The guarantee holds only while src/server writes exactly what this returns and
  has no other write path into `fields`. One function, one call site.
*/

/** What a re extraction is allowed to overwrite, per specs/domain.md invariant 1. */
const WRITABLE_STATUSES: readonly FieldStatus[] = ["auto_accepted", "needs_review"];

export type ExistingField = {
  name: FieldName;
  status: FieldStatus;
  value?: string | null;
};

export type PlannedField = {
  name: FieldName;
  value: string | null;
  confidence: number;
  box: Box | null;
  status: Extract<FieldStatus, "auto_accepted" | "needs_review" | "sampled">;
};

export type PlanFieldUpdatesArgs = {
  documentId: string;
  /** Field rows already on the document. Empty on a first extraction. */
  existing: readonly ExistingField[];
  /** The parsed model output, or the fallback's stand in for it. */
  extracted: readonly ExtractedField[];
  /** Copied onto the extraction row, per invariant 5. */
  threshold: number;
  sampleRate: number;
};

/**
 * Decide which fields this extraction may write, and what status each takes.
 *
 * A field is writable when it has no row yet, or when its status is one a human
 * has not touched. `confirmed` and `corrected` are human decisions. `sampled` is
 * excluded too: invariant 1 names a closed allowlist of `auto_accepted` and
 * `needs_review`, and leaving a sampled field alone also stops a drawn sample
 * being replaced between the draw and the reviewer seeing it.
 */
export function planFieldUpdates({
  documentId,
  existing,
  extracted,
  threshold,
  sampleRate,
}: PlanFieldUpdatesArgs): PlannedField[] {
  const statusByName = new Map(existing.map((field) => [field.name, field.status]));

  return extracted
    .filter((field) => {
      const current = statusByName.get(field.name);
      // No row yet: a first extraction populates everything.
      if (current === undefined) return true;
      return WRITABLE_STATUSES.includes(current);
    })
    .map((field) => ({
      name: field.name,
      value: field.value,
      confidence: field.confidence,
      box: field.box,
      status: statusFor(documentId, field, threshold, sampleRate),
    }));
}

function statusFor(
  documentId: string,
  field: ExtractedField,
  threshold: number,
  sampleRate: number,
): PlannedField["status"] {
  const status = classify(field.confidence, threshold);
  if (status !== "auto_accepted") return status;

  // Only auto accepted fields are eligible. A needs_review field already stops
  // the reviewer, so sampling it would mean nothing.
  return shouldSample(sampleKey(documentId, field.name), sampleRate)
    ? "sampled"
    : "auto_accepted";
}
