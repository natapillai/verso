import { get } from "@vercel/blob";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { documents } from "@/server/db/schema";

export const runtime = "nodejs";

/*
  Streams a document's bytes.

  This route is the cost of choosing a private Blob store in slice 01. Nothing in
  the store is readable by URL alone, so the review screen cannot put blob_url in
  an <img> and the page comes through a function instead. That was the trade, and
  this is the bill: about thirty lines.
*/

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;

  const [document] = await db
    .select({ blobUrl: documents.blobUrl, mimeType: documents.mimeType })
    .from(documents)
    .where(eq(documents.id, id))
    .limit(1);

  if (!document) {
    return new Response("That document is not here.", { status: 404 });
  }

  const blob = await get(document.blobUrl, { access: "private" });
  if (!blob || blob.statusCode !== 200 || !blob.stream) {
    return new Response("That page could not be read.", { status: 502 });
  }

  return new Response(blob.stream, {
    headers: {
      "content-type": document.mimeType,
      // The bytes are immutable: a document's content hash is its identity, and
      // a new upload is a new document rather than a new version of this one.
      "cache-control": "private, max-age=3600, immutable",
    },
  });
}
