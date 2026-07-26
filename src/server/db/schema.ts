import { sql } from "drizzle-orm";
import {
  check,
  doublePrecision,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/*
  The complete schema from specs/domain.md, in one migration. Columns that
  nothing writes yet are here on purpose: extraction lands in slice 02 and the
  review screen in slice 03, and neither should need a second migration.
*/

// specs/domain.md, document states. failed is reachable only when both model
// attempts and the fallback produced nothing usable, and it is never silent.
export const documentState = pgEnum("document_state", [
  "received",
  "extracting",
  "ready",
  "in_review",
  "completed",
  "failed",
]);

export const fieldStatus = pgEnum("field_status", [
  "auto_accepted",
  "needs_review",
  "sampled",
  "confirmed",
  "corrected",
]);

// The eight fields, in the order specs/extraction.md fixes for model output.
export const fieldName = pgEnum("field_name", [
  "invoice_number",
  "issue_date",
  "due_date",
  "supplier_name",
  "supplier_tax_id",
  "currency",
  "subtotal",
  "total",
]);

// An extraction is either a model attempt or the deterministic fallback. Which
// one it was decides how its confidences should be read.
export const extractionSource = pgEnum("extraction_source", [
  "model",
  "fallback",
]);

export const reviewers = pgTable("reviewers", {
  id: uuid("id").primaryKey().defaultRandom(),
  handle: text("handle").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const batches = pgTable("batches", {
  id: uuid("id").primaryKey().defaultRandom(),
  // A human readable number, so the header can say "Batch 14" rather than a uuid.
  seq: integer("seq").generatedAlwaysAsIdentity().notNull(),
  label: text("label"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => batches.id),
    filename: text("filename").notNull(),
    // Invariant 4. The unique index is the guarantee, not the lookup that
    // precedes the insert.
    contentHash: text("content_hash").notNull(),
    blobUrl: text("blob_url").notNull(),
    mimeType: text("mime_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    // Unknown until something reads the file. specs/extraction.md sends at most
    // the first two pages.
    pageCount: integer("page_count"),
    state: documentState("state").notNull().default("received"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("documents_content_hash_key").on(table.contentHash),
    index("documents_batch_id_idx").on(table.batchId),
    // The reviewer queue reads by state.
    index("documents_state_idx").on(table.state),
  ],
);

export const extractions = pgTable(
  "extractions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id),
    source: extractionSource("source").notNull(),
    // Null for the fallback, which uses no model.
    model: text("model"),
    // Invariant 5 in spirit: a prompt change must be comparable, not blurred
    // into the accuracy history before it.
    promptVersion: text("prompt_version").notNull(),
    // Invariant 5 exactly. Tuning these later must not retroactively change
    // what counted as auto accepted, or accuracy history becomes fiction.
    threshold: doublePrecision("threshold").notNull(),
    sampleRate: doublePrecision("sample_rate").notNull(),
    // specs/extraction.md: images are the expensive part of the request, so
    // record the width that was actually sent.
    imageWidth: integer("image_width"),
    latencyMs: integer("latency_ms"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    // Two attempts before the fallback runs.
    attempt: integer("attempt").notNull().default(1),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("extractions_document_id_idx").on(table.documentId),
    check(
      "extractions_threshold_range",
      sql`${table.threshold} >= 0 AND ${table.threshold} <= 1`,
    ),
    check(
      "extractions_sample_rate_range",
      sql`${table.sampleRate} >= 0 AND ${table.sampleRate} <= 1`,
    ),
  ],
);

export const fields = pgTable(
  "fields",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id),
    // Which extraction produced the value currently held. Null before anything
    // has been extracted.
    extractionId: uuid("extraction_id").references(() => extractions.id),
    name: fieldName("name").notNull(),
    // Text for every field, including the money ones. specs/extraction.md has
    // the model return strings, and a reviewer corrects what was on the page.
    value: text("value"),
    confidence: doublePrecision("confidence"),
    // Invariant 6: normalised zero through one against page dimensions, so the
    // interface does not care what resolution the document arrived at. The
    // check constraint is what makes that true rather than hoped for.
    boxX0: doublePrecision("box_x0"),
    boxY0: doublePrecision("box_y0"),
    boxX1: doublePrecision("box_x1"),
    boxY1: doublePrecision("box_y1"),
    status: fieldStatus("status").notNull().default("needs_review"),
    /*
      What extraction decided this field was, before any human touched it.
      Written once by extraction and never by review.

      Two of the three accuracy numbers are defined over a field's status before
      review: field accuracy over "needs_review fields plus sampled fields", and
      auto accept precision "restricted to fields that were sampled". `status`
      is overwritten the moment a reviewer confirms, so without this column the
      fact a field was ever drawn for verification is lost and neither number
      can be computed.

      Deriving it instead — confidence against the extraction's threshold — would
      break invariant 5: a re-extracted field points at a new extraction row with
      possibly different settings, and reading today's threshold would
      retroactively change what counted as auto accepted.
    */
    initialStatus: fieldStatus("initial_status"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Eight fields per document, exactly one row per name.
    uniqueIndex("fields_document_id_name_key").on(table.documentId, table.name),
    index("fields_document_id_idx").on(table.documentId),
    // The accuracy queries in specs/domain.md group on status.
    index("fields_status_idx").on(table.status),
    check(
      "fields_confidence_range",
      sql`${table.confidence} IS NULL OR (${table.confidence} >= 0 AND ${table.confidence} <= 1)`,
    ),
    check(
      "fields_box_normalised",
      sql`(${table.boxX0} IS NULL OR (${table.boxX0} >= 0 AND ${table.boxX0} <= 1))
        AND (${table.boxY0} IS NULL OR (${table.boxY0} >= 0 AND ${table.boxY0} <= 1))
        AND (${table.boxX1} IS NULL OR (${table.boxX1} >= 0 AND ${table.boxX1} <= 1))
        AND (${table.boxY1} IS NULL OR (${table.boxY1} >= 0 AND ${table.boxY1} <= 1))`,
    ),
    // A box is all four corners or none of them.
    check(
      "fields_box_complete",
      sql`num_nonnulls(${table.boxX0}, ${table.boxY0}, ${table.boxX1}, ${table.boxY1}) IN (0, 4)`,
    ),
  ],
);

/*
  Append only. Invariant 2: every value change writes one of these in the same
  transaction as the field update, and if this insert fails the update rolls
  back. Nothing in the codebase updates or deletes a correction row, which is
  why there is no updated_at here.
*/
export const corrections = pgTable(
  "corrections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fieldId: uuid("field_id")
      .notNull()
      .references(() => fields.id),
    previousValue: text("previous_value"),
    newValue: text("new_value"),
    reviewerId: uuid("reviewer_id")
      .notNull()
      .references(() => reviewers.id),
    // The extraction this correction disagreed with.
    extractionId: uuid("extraction_id").references(() => extractions.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("corrections_field_id_idx").on(table.fieldId),
    index("corrections_reviewer_id_idx").on(table.reviewerId),
  ],
);

export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;
export type Batch = typeof batches.$inferSelect;
export type Field = typeof fields.$inferSelect;
export type Correction = typeof corrections.$inferSelect;
export type Extraction = typeof extractions.$inferSelect;
export type Reviewer = typeof reviewers.$inferSelect;
