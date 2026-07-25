import { eq } from "drizzle-orm";
import { contentHash } from "@/domain/upload";
import { db } from "./db/client";
import { batches, documents, type Document } from "./db/schema";
import { putDocument } from "./blob";

export type ReceivedFile = {
  filename: string;
  mimeType: string;
  bytes: Uint8Array;
};

export type ReceivedDocument = {
  document: Document;
  /** True when this exact file was already in the system. Invariant 4. */
  duplicate: boolean;
};

export type UploadResult = {
  /** Null when every file in the request was a duplicate, so no batch was made. */
  batchId: string | null;
  documents: ReceivedDocument[];
};

async function findByHash(hash: string): Promise<Document | undefined> {
  const [row] = await db
    .select()
    .from(documents)
    .where(eq(documents.contentHash, hash))
    .limit(1);

  return row;
}

/**
 * Store one file, or report the document that already holds its bytes.
 *
 * The lookup first is a fast path that saves a pointless blob write for the
 * common duplicate. It is not the guarantee. The unique index on content_hash
 * is, which is why the insert reads the result of a conflict rather than
 * trusting the lookup it just did: two identical files uploaded at the same
 * moment would both pass that lookup.
 */
async function receiveFile(
  file: ReceivedFile,
  batchIdFor: () => Promise<string>,
): Promise<ReceivedDocument> {
  const hash = contentHash(file.bytes);

  const existing = await findByHash(hash);
  if (existing) {
    return { document: existing, duplicate: true };
  }

  // The blob is written before the row exists, so a failed insert leaves an
  // orphan. Accepted: the alternative is a nullable blob_url and a second
  // write, and the pathname is the hash, so a retry overwrites rather than
  // accumulates. See docs/decisions.md.
  const blobUrl = await putDocument(hash, file.filename, file.bytes, file.mimeType);

  const [inserted] = await db
    .insert(documents)
    .values({
      batchId: await batchIdFor(),
      filename: file.filename,
      contentHash: hash,
      blobUrl,
      mimeType: file.mimeType,
      byteSize: file.bytes.byteLength,
      state: "received",
    })
    .onConflictDoNothing({ target: documents.contentHash })
    .returning();

  if (inserted) {
    return { document: inserted, duplicate: false };
  }

  // Lost the race. Somebody else inserted this hash between the lookup and the
  // insert, so their document is the one document.
  const winner = await findByHash(hash);
  if (!winner) {
    throw new Error(
      `Insert of ${hash} conflicted but no document holds that hash.`,
    );
  }

  return { document: winner, duplicate: true };
}

/**
 * Take a batch of files. Extraction does not run here: the documents are
 * accepted, not read, which is what the 202 on the route means.
 */
export async function receiveUpload(
  files: ReceivedFile[],
  label?: string,
): Promise<UploadResult> {
  let batchId: string | null = null;

  // A batch is only worth a row once something new lands in it. A request of
  // nothing but duplicates leaves no trace, and a duplicate keeps the batch it
  // originally arrived in.
  const batchIdFor = async (): Promise<string> => {
    if (batchId) return batchId;

    const [batch] = await db
      .insert(batches)
      .values({ label: label ?? null })
      .returning({ id: batches.id });

    if (!batch) {
      throw new Error("Could not open a batch for this upload.");
    }

    batchId = batch.id;
    return batchId;
  };

  const received: ReceivedDocument[] = [];

  // Sequential rather than parallel. Two identical files inside one request is
  // a real case, and the second should see the first.
  for (const file of files) {
    received.push(await receiveFile(file, batchIdFor));
  }

  return { batchId, documents: received };
}
