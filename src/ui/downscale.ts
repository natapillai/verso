/*
  Shrinks a page in the browser before it is uploaded.

  specs/delivery.md gives two reasons and both matter. A server side upload caps
  at 4.5MB of request body on Vercel, and a phone photo or a scanned page can
  exceed that. And images are the expensive part of a model request, so this also
  cuts the extraction cost — the page only needs to be legible, not archival.

  Client side uploads direct to Blob would also solve the size limit, and are the
  wrong trade here: a token exchange, a webhook that does not reach localhost in
  development, and an authorisation surface, in exchange for file sizes this
  product does not need.
*/

/** specs/delivery.md: "a max width of about 1600px". */
export const MAX_UPLOAD_WIDTH = 1600;

/** Enough to keep small text legible without paying for a lossless page. */
const JPEG_QUALITY = 0.9;

/**
 * Returns a downscaled copy of the file, or the file untouched.
 *
 * A PDF is passed through: there is no canvas path for one, and rasterising it
 * here would need a PDF renderer in the browser bundle. Anything already inside
 * the width budget is passed through too, so re-encoding never costs quality for
 * nothing.
 */
export async function downscale(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    // An image the browser cannot decode is still worth uploading: the model may
    // read a format this browser does not, and the size cap will catch it if not.
    return file;
  }

  try {
    if (bitmap.width <= MAX_UPLOAD_WIDTH) return file;

    const scale = MAX_UPLOAD_WIDTH / bitmap.width;
    const width = MAX_UPLOAD_WIDTH;
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) return file;

    context.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY);
    });

    if (!blob) return file;

    return new File([blob], replaceExtension(file.name, "jpg"), {
      type: "image/jpeg",
      lastModified: file.lastModified,
    });
  } finally {
    bitmap.close();
  }
}

function replaceExtension(filename: string, extension: string): string {
  const dot = filename.lastIndexOf(".");
  const stem = dot === -1 ? filename : filename.slice(0, dot);
  return `${stem}.${extension}`;
}
