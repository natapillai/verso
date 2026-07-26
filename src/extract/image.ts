/*
  Reads an image's width from its header.

  specs/extraction.md wants the width that was actually sent recorded on the
  extraction row, because images are the expensive part of the request and the
  README quotes a measured cost figure. Measuring the bytes on their way out is
  the only version of that which cannot drift from what really happened.

  Hand rolled rather than pulled in as a dependency: it is two headers, and the
  slice already adds one package.
*/

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Start of frame markers. Everything in 0xC0–0xCF except DHT, JPG and DAC. */
function isStartOfFrame(marker: number): boolean {
  return (
    marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
  );
}

/**
 * The image's width in pixels, or null when the bytes are not a PNG or JPEG.
 *
 * Null is a real answer, not a failure: a PDF has no single width, and saying so
 * beats putting a fabricated number into a cost calculation.
 */
export function imageWidth(bytes: Uint8Array): number | null {
  return pngWidth(bytes) ?? jpegWidth(bytes);
}

function pngWidth(bytes: Uint8Array): number | null {
  // Signature, then a 4 byte length, "IHDR", then width as a 4 byte big endian.
  if (bytes.length < 24) return null;
  if (!PNG_SIGNATURE.every((byte, i) => bytes[i] === byte)) return null;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16);
  return width > 0 ? width : null;
}

function jpegWidth(bytes: Uint8Array): number | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 2;

  // Walk the segment chain looking for the frame header that carries the size.
  while (offset + 1 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = bytes[offset + 1]!;
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }

    if (offset + 3 >= bytes.length) return null;
    const length = view.getUint16(offset + 2);

    if (isStartOfFrame(marker)) {
      // length(2) precision(1) height(2) width(2)
      if (offset + 9 >= bytes.length) return null;
      const width = view.getUint16(offset + 7);
      return width > 0 ? width : null;
    }

    if (length < 2) return null;
    offset += 2 + length;
  }

  return null;
}
