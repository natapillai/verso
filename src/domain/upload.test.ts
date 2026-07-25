import { describe, expect, it } from "vitest";
import {
  ACCEPTED_MIME_TYPES,
  MAX_UPLOAD_BYTES,
  UploadFileSchema,
  blobPathname,
  contentHash,
} from "./upload";

const bytes = (text: string): Uint8Array => new TextEncoder().encode(text);

const validFile = {
  filename: "invoice.pdf",
  mimeType: "application/pdf",
  byteSize: 12_345,
};

describe("UploadFileSchema", () => {
  it("rejects a file over the 4.5MB request body cap", () => {
    const result = UploadFileSchema.safeParse({
      ...validFile,
      byteSize: MAX_UPLOAD_BYTES + 1,
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain("over 4.5MB");
  });

  it("accepts a file exactly on the cap", () => {
    const result = UploadFileSchema.safeParse({
      ...validFile,
      byteSize: MAX_UPLOAD_BYTES,
    });

    expect(result.success).toBe(true);
  });

  it("rejects an empty file", () => {
    const result = UploadFileSchema.safeParse({ ...validFile, byteSize: 0 });

    expect(result.success).toBe(false);
  });

  it("rejects a mime type the model cannot read", () => {
    const result = UploadFileSchema.safeParse({
      ...validFile,
      mimeType: "application/vnd.ms-excel",
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain(
      "PNG, JPEG, WebP, and PDF",
    );
  });

  it("rejects a file with a blank name", () => {
    const result = UploadFileSchema.safeParse({ ...validFile, filename: "   " });

    expect(result.success).toBe(false);
  });

  it.each(ACCEPTED_MIME_TYPES)("accepts %s", (mimeType) => {
    const result = UploadFileSchema.safeParse({ ...validFile, mimeType });

    expect(result.success).toBe(true);
  });
});

describe("contentHash", () => {
  it("matches the published sha256 vector for 'abc'", () => {
    expect(contentHash(bytes("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("agrees for two separately built copies of the same bytes", () => {
    expect(contentHash(bytes("INV-2024-0817"))).toBe(
      contentHash(bytes("INV-2024-0817")),
    );
  });

  it("diverges when a single byte changes", () => {
    expect(contentHash(bytes("INV-2024-0817"))).not.toBe(
      contentHash(bytes("INV-2024-0818")),
    );
  });

  it("hashes an empty file rather than throwing", () => {
    expect(contentHash(new Uint8Array())).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });
});

describe("blobPathname", () => {
  it("keeps the extension so the store stays readable", () => {
    expect(blobPathname("abc123", "Invoice August.PDF")).toBe(
      "documents/abc123.pdf",
    );
  });

  it("handles a file with no extension", () => {
    expect(blobPathname("abc123", "scan")).toBe("documents/abc123");
  });

  it("gives two identical files the same pathname, which is the point", () => {
    expect(blobPathname("abc123", "a.png")).toBe(blobPathname("abc123", "b.png"));
  });
});
