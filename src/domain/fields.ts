import { z } from "zod";

/**
 * The eight scalar fields, in the order specs/extraction.md fixes for model
 * output. No line items: they are a table extraction problem and demonstrate
 * nothing these eight do not.
 */
export const FIELD_NAMES = [
  "invoice_number",
  "issue_date",
  "due_date",
  "supplier_name",
  "supplier_tax_id",
  "currency",
  "subtotal",
  "total",
] as const;

export type FieldName = (typeof FIELD_NAMES)[number];

/** Normalised to zero through one against page dimensions. Invariant 6. */
export const BoxSchema = z.object({
  x0: z.number().min(0).max(1),
  y0: z.number().min(0).max(1),
  x1: z.number().min(0).max(1),
  y1: z.number().min(0).max(1),
});

export type Box = z.infer<typeof BoxSchema>;

export const ExtractedFieldSchema = z.object({
  name: z.enum(FIELD_NAMES),
  // Nullable because the field genuinely may not be on the page. A null with
  // high confidence means the model is sure it is absent, which is different
  // from a null it could not read.
  value: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  box: BoxSchema.nullable(),
});

export type ExtractedField = z.infer<typeof ExtractedFieldSchema>;

/**
 * The model's whole output. Exactly eight entries, one per field name, in the
 * fixed order.
 *
 * The length check alone would accept eight entries containing a duplicate,
 * which looks well formed while leaving a field unextracted. The refinement is
 * what makes "one per name, in a fixed order" true rather than assumed.
 */
export const ExtractedSchema = z.object({
  fields: z
    .array(ExtractedFieldSchema)
    .length(8)
    .refine(
      (fields) => fields.every((field, i) => field.name === FIELD_NAMES[i]),
      {
        message:
          "fields must be the eight field names exactly once each, in the order given in specs/extraction.md",
      },
    ),
});

export type Extracted = z.infer<typeof ExtractedSchema>;

/** Field statuses from specs/domain.md. */
export const FIELD_STATUSES = [
  "auto_accepted",
  "needs_review",
  "sampled",
  "confirmed",
  "corrected",
] as const;

export type FieldStatus = (typeof FIELD_STATUSES)[number];
