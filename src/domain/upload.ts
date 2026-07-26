import { createHash } from "node:crypto";
import { z } from "zod";

/**
 * Vercel caps a server side upload at 4.5MB of request body. A phone photo or
 * a scanned PDF can exceed that, so the limit is enforced here with a message
 * that says what to do, rather than surfacing as a platform 413.
 */
export const MAX_UPLOAD_BYTES = 4_500_000;

/**
 * The model reads the page directly, so anything it can see is acceptable.
 * There is no OCR step to constrain the format further.
 */
export const ACCEPTED_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
] as const;

export type AcceptedMimeType = (typeof ACCEPTED_MIME_TYPES)[number];

/**
 * The sha256 of the file's bytes, hex encoded. This is the identity of a
 * document: invariant 4 in specs/domain.md says the same file uploaded twice
 * is one document, and the hash is what makes that decidable.
 */
export function contentHash(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Everything about an uploaded file that can be judged without a database.
 * The route reads a File off the form and hands the parts here.
 */
export const UploadFileSchema = z.object({
  filename: z
    .string()
    .trim()
    .min(1, "That file has no name. Rename it and upload it again.")
    .max(255, "That file name is too long. Shorten it and upload it again."),
  mimeType: z.enum(ACCEPTED_MIME_TYPES, {
    message:
      "Verso reads PNG, JPEG, WebP, and PDF. Convert the file and upload it again.",
  }),
  byteSize: z
    .number()
    .int()
    .positive("That file is empty. Check it opens, then upload it again.")
    .max(
      MAX_UPLOAD_BYTES,
      "That file is over 4.5MB. Shrink it or photograph the page again at a lower resolution.",
    ),
});

export type UploadFile = z.infer<typeof UploadFileSchema>;

/**
 * Where a document's bytes live in the blob store. Kept next to the hash so
 * the store stays readable when someone opens it in the dashboard, and so two
 * documents can never collide on a pathname.
 */
export function blobPathname(hash: string, filename: string): string {
  const extension = filename.includes(".")
    ? filename.slice(filename.lastIndexOf(".")).toLowerCase()
    : "";
  return `documents/${hash}${extension}`;
}
