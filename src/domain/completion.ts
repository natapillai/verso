import { FIELD_NAMES, type FieldName, type FieldStatus } from "./fields";

/*
  Invariant 3 in specs/domain.md: a document cannot be completed while any field
  is needs_review or sampled.

  Both statuses block for the same reason from opposite directions. A
  needs_review field is one the model was unsure about. A sampled field is one it
  was sure about, drawn for verification anyway. If sampled fields did not block,
  nobody would ever check them, and auto accept precision would measure nothing.
*/

/** Statuses that mean a human has settled the field, one way or the other. */
const SETTLED: readonly FieldStatus[] = ["confirmed", "corrected", "auto_accepted"];

export type CompletionCheck =
  | { ok: true }
  | { ok: false; outstanding: FieldName[] };

export function canComplete(
  fields: readonly { name: FieldName; status: FieldStatus }[],
): CompletionCheck {
  // A document with fewer than eight fields has not been extracted, or lost
  // rows. Completing it would put a hole in the accuracy denominators.
  if (fields.length < FIELD_NAMES.length) {
    const present = new Set(fields.map((f) => f.name));
    return {
      ok: false,
      outstanding: FIELD_NAMES.filter((name) => !present.has(name)),
    };
  }

  const outstanding = FIELD_NAMES.filter((name) => {
    const field = fields.find((f) => f.name === name);
    return !field || !SETTLED.includes(field.status);
  });

  return outstanding.length === 0 ? { ok: true } : { ok: false, outstanding };
}

const COUNT_WORDS = ["No", "One", "Two", "Three", "Four", "Five"] as const;

/**
 * The blocked-completion sentence. specs/design.md fixes the wording and the
 * voice: it says what happened and what to do next, and it does not apologise.
 */
export function describeOutstanding(outstanding: readonly FieldName[]): string {
  const count = outstanding.length;
  const word = COUNT_WORDS[count] ?? String(count);
  const noun = count === 1 ? "field still needs" : "fields still need";

  return `${word} ${noun} you before this one can be completed.`;
}
