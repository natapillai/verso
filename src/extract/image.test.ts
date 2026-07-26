import { describe, expect, it } from "vitest";
import { imageWidth } from "./image";

/*
  specs/extraction.md: "downscale to a sensible width before sending and record
  what that width was". Measuring the bytes actually being sent is the only
  reading of that which cannot drift from reality, and it needs no extra column
  on the document row.
*/

/** A PNG header with a chosen width. Only the IHDR fields are read. */
function png(width: number, height = 100): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0); // signature
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13); // IHDR length
  bytes.set([0x49, 0x48, 0x44, 0x52], 12); // "IHDR"
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

/** A JPEG with a single SOF0 segment carrying the dimensions. */
function jpeg(width: number, height = 100): Uint8Array {
  const bytes = new Uint8Array(20);
  bytes.set([0xff, 0xd8], 0); // SOI
  bytes.set([0xff, 0xc0], 2); // SOF0
  const view = new DataView(bytes.buffer);
  view.setUint16(4, 11); // segment length
  bytes[6] = 8; // precision
  view.setUint16(7, height);
  view.setUint16(9, width);
  return bytes;
}

describe("imageWidth", () => {
  it("reads a PNG width", () => {
    expect(imageWidth(png(1600))).toBe(1600);
  });

  it("reads a one pixel PNG", () => {
    expect(imageWidth(png(1))).toBe(1);
  });

  it("reads a JPEG width", () => {
    expect(imageWidth(jpeg(1600))).toBe(1600);
  });

  it("reads a JPEG width when the SOF marker is a variant", () => {
    const bytes = jpeg(800);
    bytes[3] = 0xc2; // progressive JPEG
    expect(imageWidth(bytes)).toBe(800);
  });

  /*
    A PDF has no single width and the extraction row is allowed to say so. Null
    is a truthful answer, and better than a fabricated number in a cost figure
    the README will quote.
  */
  it("returns null for a PDF", () => {
    const pdf = new TextEncoder().encode("%PDF-1.7\n%âãÏÓ\n");
    expect(imageWidth(pdf)).toBeNull();
  });

  it("returns null for bytes that are not an image", () => {
    expect(imageWidth(new TextEncoder().encode("hello"))).toBeNull();
  });

  it("returns null for a truncated PNG rather than reading past the end", () => {
    expect(imageWidth(png(1600).slice(0, 12))).toBeNull();
  });

  it("returns null for a truncated JPEG", () => {
    expect(imageWidth(jpeg(1600).slice(0, 5))).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(imageWidth(new Uint8Array())).toBeNull();
  });
});
