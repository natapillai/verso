import { put } from "@vercel/blob";
import { blobPathname } from "@/domain/upload";

/*
  No token appears in this file or anywhere else. The store is connected to the
  project, so the SDK pairs BLOB_STORE_ID with VERCEL_OIDC_TOKEN, both of which
  Vercel populates and rotates. See the storage notes in specs/delivery.md.

  Locally the OIDC token expires. When uploads start failing with an auth error
  while everything else works, run `vercel env pull .env.local` again.
*/

export async function putDocument(
  hash: string,
  filename: string,
  bytes: Uint8Array,
  mimeType: string,
): Promise<string> {
  // The SDK takes a Buffer rather than a bare Uint8Array. No copy: Buffer.from
  // on a typed array view shares the underlying memory.
  const body = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const blob = await put(blobPathname(hash, filename), body, {
    // Invoices are client documents. The store is private, so reading one goes
    // through a function rather than a public URL.
    access: "private",
    contentType: mimeType,
    // Two uploads of the same file resolve to the same pathname, which is
    // correct: they are one document. Without this the second put would throw.
    allowOverwrite: true,
  });

  return blob.url;
}
