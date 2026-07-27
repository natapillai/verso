import { sql } from "drizzle-orm";
import { db } from "./db/client";

/*
  The queue behind the landing page.

  Success criterion 1 in specs/product.md: a stranger opens the deployed URL and
  understands the product within thirty seconds without a walkthrough. Until this
  existed the landing page listed only what you had uploaded in the current
  browser session, so a seeded deployment showed a stranger an empty form and the
  twenty demo documents sat in the database invisible.

  One query. Counting fields per document in the page would be twenty round trips
  for twenty documents.
*/

export type QueueDocument = {
  id: string;
  filename: string;
  state: string;
  batchSeq: number;
  batchLabel: string | null;
  /** Fields still owed attention: needs_review plus sampled. Invariant 3. */
  outstanding: number;
  corrected: number;
  fieldCount: number;
};

export type QueueSummary = {
  documents: QueueDocument[];
  total: number;
  completed: number;
  /** Documents with at least one field still owed attention. */
  waiting: number;
};

export async function loadQueue(limit = 30): Promise<QueueSummary> {
  const result = await db.execute<{
    id: string;
    filename: string;
    state: string;
    batch_seq: number;
    batch_label: string | null;
    outstanding: string;
    corrected: string;
    field_count: string;
  }>(sql`
    SELECT d.id,
           d.filename,
           d.state,
           b.seq   AS batch_seq,
           b.label AS batch_label,
           count(f.id) FILTER (WHERE f.status IN ('needs_review', 'sampled')) AS outstanding,
           count(f.id) FILTER (WHERE f.status = 'corrected')                  AS corrected,
           count(f.id)                                                        AS field_count
    FROM documents d
    JOIN batches b ON b.id = d.batch_id
    LEFT JOIN fields f ON f.document_id = d.id
    GROUP BY d.id, d.filename, d.state, d.created_at, b.seq, b.label
    ORDER BY d.created_at DESC
    LIMIT ${limit}
  `);

  const documents = result.rows.map((row) => ({
    id: row.id,
    filename: row.filename,
    state: row.state,
    batchSeq: Number(row.batch_seq),
    batchLabel: row.batch_label,
    outstanding: Number(row.outstanding),
    corrected: Number(row.corrected),
    fieldCount: Number(row.field_count),
  }));

  return {
    documents,
    total: documents.length,
    completed: documents.filter((d) => d.state === "completed").length,
    waiting: documents.filter((d) => d.outstanding > 0).length,
  };
}
