import { get } from "@vercel/blob";
import { eq, inArray } from "drizzle-orm";
import { planFieldUpdates, type ExistingField } from "@/domain/extraction-merge";
import { AUTO_ACCEPT_THRESHOLD, SAMPLE_RATE } from "@/domain/thresholds";
import { anthropicTransport, isModelAvailable } from "@/extract/client";
import { extractDocument } from "@/extract/extract";
import { db } from "./db/client";
import { documents, extractions, fields } from "./db/schema";

/*
  Runs one extraction against one document and writes the result.

  The only write path into `fields` is the list planFieldUpdates returns. That is
  what makes invariant 1 hold in practice: this file never decides for itself
  which fields to touch, so a field a human confirmed or corrected cannot be
  overwritten from here.
*/

export type ExtractionResult = {
  documentId: string;
  extractionId: string;
  source: "model" | "fallback";
  fieldsWritten: number;
  fieldsPreserved: number;
  state: "ready" | "failed";
};

export class DocumentNotFoundError extends Error {
  constructor(documentId: string) {
    super(`No document with id ${documentId}.`);
    this.name = "DocumentNotFoundError";
  }
}

export async function runExtraction(documentId: string): Promise<ExtractionResult> {
  const [document] = await db
    .select()
    .from(documents)
    .where(eq(documents.id, documentId))
    .limit(1);

  if (!document) throw new DocumentNotFoundError(documentId);

  await db
    .update(documents)
    .set({ state: "extracting", updatedAt: new Date() })
    .where(eq(documents.id, documentId));

  let bytes: Uint8Array;
  try {
    bytes = await readBlob(document.blobUrl);
  } catch (error) {
    // Could not even read the page. This is the rare, visible failure
    // specs/domain.md describes, and the retry path exists for it.
    await db
      .update(documents)
      .set({ state: "failed", updatedAt: new Date() })
      .where(eq(documents.id, documentId));
    throw error;
  }

  const outcome = await extractDocument({
    bytes,
    mimeType: document.mimeType,
    transport: isModelAvailable() ? anthropicTransport() : undefined,
    modelAvailable: isModelAvailable(),
    // No OCR step by design, so an image carries no text for the fallback to
    // read. It still returns all eight names, which is what gets a document to a
    // reviewer with every field flagged.
    fallbackText: "",
  });

  return db.transaction(async (tx) => {
    const [extraction] = await tx
      .insert(extractions)
      .values({
        documentId,
        source: outcome.source,
        model: outcome.model,
        promptVersion: outcome.promptVersion,
        // Invariant 5: copied onto the row now, so tuning these later cannot
        // retroactively change what counted as auto accepted.
        threshold: AUTO_ACCEPT_THRESHOLD,
        sampleRate: SAMPLE_RATE,
        imageWidth: outcome.imageWidth,
        latencyMs: outcome.latencyMs,
        inputTokens: outcome.inputTokens,
        outputTokens: outcome.outputTokens,
        attempt: outcome.attempt,
        error: outcome.error,
      })
      .returning({ id: extractions.id });

    if (!extraction) throw new Error("Could not record the extraction.");

    // Read inside the transaction: a reviewer correcting a field between the
    // read and the write would otherwise have their value overwritten by a plan
    // built from stale statuses.
    const existing = await tx
      .select({ name: fields.name, status: fields.status })
      .from(fields)
      .where(eq(fields.documentId, documentId));

    const planned = planFieldUpdates({
      documentId,
      existing: existing as ExistingField[],
      extracted: outcome.fields,
      threshold: AUTO_ACCEPT_THRESHOLD,
      sampleRate: SAMPLE_RATE,
    });

    for (const field of planned) {
      await tx
        .insert(fields)
        .values({
          documentId,
          extractionId: extraction.id,
          name: field.name,
          value: field.value,
          confidence: field.confidence,
          boxX0: field.box?.x0 ?? null,
          boxY0: field.box?.y0 ?? null,
          boxX1: field.box?.x1 ?? null,
          boxY1: field.box?.y1 ?? null,
          status: field.status,
          // What extraction decided, kept for the accuracy queries. Set on
          // insert and again on re-extraction, because a re-extraction is a
          // fresh decision — but never touched by review.
          initialStatus: field.status,
        })
        .onConflictDoUpdate({
          target: [fields.documentId, fields.name],
          set: {
            extractionId: extraction.id,
            value: field.value,
            confidence: field.confidence,
            boxX0: field.box?.x0 ?? null,
            boxY0: field.box?.y0 ?? null,
            boxX1: field.box?.x1 ?? null,
            boxY1: field.box?.y1 ?? null,
            status: field.status,
            initialStatus: field.status,
            updatedAt: new Date(),
          },
          // Belt and braces on invariant 1, enforced by the database rather than
          // by this file being careful. The planner has already excluded rows a
          // human has touched; this makes the update a no-op even if a future
          // edit to the planner let one through.
          setWhere: inArray(fields.status, ["auto_accepted", "needs_review"]),
        });
    }

    await tx
      .update(documents)
      .set({ state: "ready", updatedAt: new Date() })
      .where(eq(documents.id, documentId));

    return {
      documentId,
      extractionId: extraction.id,
      source: outcome.source,
      fieldsWritten: planned.length,
      fieldsPreserved: existing.length - planned.length > 0
        ? existing.length - planned.length
        : 0,
      state: "ready" as const,
    };
  });
}

async function readBlob(blobUrl: string): Promise<Uint8Array> {
  const result = await get(blobUrl, { access: "private" });

  if (!result) throw new Error(`Blob ${blobUrl} is gone.`);
  if (result.statusCode !== 200 || !result.stream) {
    throw new Error(`Blob ${blobUrl} returned ${result.statusCode}.`);
  }

  const chunks: Uint8Array[] = [];
  const reader = result.stream.getReader();

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }

  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return bytes;
}
