import { and, asc, desc, eq, ne } from "drizzle-orm";
import { canComplete, describeOutstanding } from "@/domain/completion";
import {
  planConfirmation,
  planCorrection,
  type ReviewableField,
} from "@/domain/corrections";
import { FIELD_NAMES, type FieldName } from "@/domain/fields";
import { db } from "./db/client";
import { batches, corrections, documents, fields, reviewers } from "./db/schema";
import { currentReviewerId } from "./reviewer";

/*
  Everything the review screen does to the database.

  Invariant 2 lives in correctField: the field update and its correction row go
  in one transaction, so a failed correction insert rolls the value back rather
  than leaving a change nobody can account for.
*/

export class FieldNotFoundError extends Error {
  constructor(id: string) {
    super(`No field with id ${id}.`);
    this.name = "FieldNotFoundError";
  }
}

export class CompletionBlockedError extends Error {
  constructor(readonly outstanding: FieldName[]) {
    super(describeOutstanding(outstanding));
    this.name = "CompletionBlockedError";
  }
}

export type ReviewField = {
  id: string;
  name: FieldName;
  value: string | null;
  confidence: number | null;
  status: ReviewableField["status"];
  box: { x0: number; y0: number; x1: number; y1: number } | null;
  /** Set only on a corrected field: what it said before, and who changed it. */
  correction: { previousValue: string | null; reviewer: string; at: string } | null;
};

export type ReviewDocument = {
  id: string;
  filename: string;
  mimeType: string;
  state: string;
  batchSeq: number;
  batchLabel: string | null;
  /** Progress through the batch, for the header. */
  doneInBatch: number;
  totalInBatch: number;
  fields: ReviewField[];
};

export async function loadReview(documentId: string): Promise<ReviewDocument | null> {
  const [document] = await db
    .select()
    .from(documents)
    .where(eq(documents.id, documentId))
    .limit(1);

  if (!document) return null;

  const [batch] = await db
    .select({ seq: batches.seq, label: batches.label })
    .from(batches)
    .where(eq(batches.id, document.batchId))
    .limit(1);

  const siblings = await db
    .select({ id: documents.id, state: documents.state })
    .from(documents)
    .where(eq(documents.batchId, document.batchId));

  const rows = await db
    .select()
    .from(fields)
    .where(eq(fields.documentId, documentId));

  // Latest correction per field, so a corrected row can show what it used to say
  // and who changed it after a reload. Success criterion 3.
  const log = await db
    .select({
      fieldId: corrections.fieldId,
      previousValue: corrections.previousValue,
      handle: reviewers.handle,
      createdAt: corrections.createdAt,
    })
    .from(corrections)
    .innerJoin(reviewers, eq(corrections.reviewerId, reviewers.id))
    .orderBy(desc(corrections.createdAt));

  const latestByField = new Map<string, (typeof log)[number]>();
  for (const entry of log) {
    if (!latestByField.has(entry.fieldId)) latestByField.set(entry.fieldId, entry);
  }

  // Always in the spec's field order, never the database's.
  const byName = new Map(rows.map((row) => [row.name, row]));
  const ordered = FIELD_NAMES.flatMap<ReviewField>((name) => {
    const row = byName.get(name);
    if (!row) return [];

    const entry = latestByField.get(row.id);
    return [
      {
        id: row.id,
        name,
        value: row.value,
        confidence: row.confidence,
        status: row.status,
        box: hasBox(row) ? { x0: row.boxX0!, y0: row.boxY0!, x1: row.boxX1!, y1: row.boxY1! } : null,
        correction:
          row.status === "corrected" && entry
            ? {
                previousValue: entry.previousValue,
                reviewer: entry.handle,
                at: entry.createdAt.toISOString(),
              }
            : null,
      },
    ];
  });

  return {
    id: document.id,
    filename: document.filename,
    // The panel needs to know whether it can put this in an <img>. A PDF cannot
    // go in one, and a browser renders nothing at all rather than complaining.
    mimeType: document.mimeType,
    state: document.state,
    batchSeq: batch?.seq ?? 0,
    batchLabel: batch?.label ?? null,
    doneInBatch: siblings.filter((s) => s.state === "completed").length,
    totalInBatch: siblings.length,
    fields: ordered,
  };
}

function hasBox(row: { boxX0: number | null; boxY0: number | null; boxX1: number | null; boxY1: number | null }) {
  return row.boxX0 !== null && row.boxY0 !== null && row.boxX1 !== null && row.boxY1 !== null;
}

async function loadField(id: string): Promise<ReviewableField> {
  const [row] = await db.select().from(fields).where(eq(fields.id, id)).limit(1);
  if (!row) throw new FieldNotFoundError(id);

  return {
    id: row.id,
    name: row.name,
    value: row.value,
    status: row.status,
    extractionId: row.extractionId,
  };
}

/** A reviewer agreed. No correction row: confirming is not a value change. */
export async function confirmField(id: string): Promise<void> {
  const plan = planConfirmation(await loadField(id));

  await db
    .update(fields)
    .set({ status: plan.field.status, updatedAt: new Date() })
    .where(eq(fields.id, plan.field.id));
}

/**
 * A reviewer disagreed. Invariant 2: the value change and its correction row
 * commit together or not at all.
 */
export async function correctField(id: string, newValue: string | null): Promise<void> {
  const field = await loadField(id);
  const reviewerId = await currentReviewerId();
  const plan = planCorrection(field, newValue, reviewerId);

  await db.transaction(async (tx) => {
    await tx
      .update(fields)
      .set({
        value: plan.field.value,
        status: plan.field.status,
        updatedAt: new Date(),
      })
      .where(eq(fields.id, plan.field.id));

    // If this throws, the update above rolls back with it. That is the whole
    // point of the invariant: a value never moves without an account of why.
    await tx.insert(corrections).values(plan.correction);
  });
}

export type CompletionResult = { nextDocumentId: string | null };

/** Invariant 3: blocked while any field is needs_review or sampled. */
export async function completeDocument(documentId: string): Promise<CompletionResult> {
  const rows = await db
    .select({ name: fields.name, status: fields.status })
    .from(fields)
    .where(eq(fields.documentId, documentId));

  const check = canComplete(rows);
  if (!check.ok) throw new CompletionBlockedError(check.outstanding);

  const [document] = await db
    .select({ batchId: documents.batchId })
    .from(documents)
    .where(eq(documents.id, documentId))
    .limit(1);

  if (!document) throw new Error(`No document with id ${documentId}.`);

  await db
    .update(documents)
    .set({ state: "completed", updatedAt: new Date() })
    .where(eq(documents.id, documentId));

  // Keep the reviewer's rhythm going: hand them the next unfinished document in
  // the same batch rather than dropping them back at an upload form.
  const [next] = await db
    .select({ id: documents.id })
    .from(documents)
    .where(
      and(
        eq(documents.batchId, document.batchId),
        ne(documents.state, "completed"),
        ne(documents.id, documentId),
      ),
    )
    .orderBy(asc(documents.createdAt))
    .limit(1);

  return { nextDocumentId: next?.id ?? null };
}
