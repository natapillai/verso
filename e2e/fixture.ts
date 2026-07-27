import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";

/*
  The fixture invoice, marked so that every run uploads a page no run has
  uploaded before.

  Invariant 4 identifies a document by the sha256 of its content, so the same
  bytes uploaded twice are one document. That is the behaviour the second spec
  exists to prove, and it is also why a fixture uploaded verbatim would, from the
  second run onward, dedup into the document the first run already reviewed and
  completed — leaving the spec asserting against someone else's work.

  Renaming the file does not help, because the name is not hashed. Nor does image
  metadata: downscale() redraws anything wider than 1600px through a canvas,
  which keeps the pixels and discards everything else. So the difference has to
  be pixels, and the drawing has to happen in the page, because the browser holds
  the only image encoder either spec has.

  Resolved from the project root rather than the module: Playwright compiles
  these specs to CommonJS, where import.meta.url is not available.
*/

const FIXTURE = path.resolve("e2e/fixtures/invoice.png");

/**
 * Returns the fixture with a run marker painted into its bottom margin, clear of
 * every printed field so extraction still reads the same invoice.
 *
 * The page must already be loaded — this borrows its canvas.
 */
export async function freshInvoice(page: Page): Promise<Buffer> {
  const source = `data:image/png;base64,${readFileSync(FIXTURE).toString("base64")}`;
  // 48 bits of colour, so two runs painting the same marker is not a thing that
  // happens and then takes an afternoon to explain.
  const marker = [randomBytes(3).toString("hex"), randomBytes(3).toString("hex")];

  const encoded = await page.evaluate(
    async ({ source, marker }: { source: string; marker: string[] }) => {
      const image = new Image();
      image.src = source;
      await image.decode();

      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;

      const context = canvas.getContext("2d");
      if (!context) throw new Error("the test browser gave no 2d context");

      context.drawImage(image, 0, 0);
      marker.forEach((colour, index) => {
        context.fillStyle = `#${colour}`;
        context.fillRect(24 + index * 32, image.height - 48, 24, 24);
      });

      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, "image/png");
      });
      if (!blob) throw new Error("the test browser would not encode the marked page");

      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = "";
      for (const byte of bytes) binary += String.fromCharCode(byte);
      return btoa(binary);
    },
    { source, marker },
  );

  return Buffer.from(encoded, "base64");
}
