"use client";

import { useRef, useState } from "react";
import type { ReviewField } from "@/server/review";

/*
  The page itself, on the left.

  It scrolls and zooms independently of the field column, because the reviewer's
  hands live on the right and the document should never drag the fields out of
  reach. Zoom is fit, minus, plus — exactly the three controls in the mockup.
  TASKS.md has zoom second on the cut list, so it stays small on purpose.

  No colour is spent here, and no region is outlined. `pnpm eval:boxes` measures
  the model's bounding boxes against where the values really are and finds that
  10% of them land on the value, so drawing one would send the reviewer to the
  wrong part of the page with a straight face. See docs/decisions.md.
*/

type Props = {
  documentId: string;
  filename: string;
  mimeType: string;
  focused: ReviewField | null;
};

const ZOOM_STEP = 0.25;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;

export function DocumentPanel({ documentId, filename, mimeType, focused }: Props) {
  const isPdf = mimeType === "application/pdf";
  const [zoom, setZoom] = useState(1);
  const scrollRef = useRef<HTMLDivElement>(null);

  function changeZoom(next: number) {
    setZoom(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next)));
  }

  return (
    <section
      className="flex min-h-0 flex-col border-rule lg:border-r"
      aria-label="Document"
    >
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto bg-ground p-6">
        {/*
          A PDF gets the browser's own viewer. It cannot go in an <img> — no
          browser renders one that way, and it fails silently, showing a broken
          image rather than an error. The seeded corpus is images for exactly
          that reason, but a PDF is an accepted upload and has to work.

          Nothing is outlined over it either, but that is no longer specific to
          PDFs — see the note at the top of this file.
        */}
        {isPdf ? (
          <object
            data={`/api/documents/${documentId}/file`}
            type="application/pdf"
            aria-label={`Page of ${filename}`}
            className="mx-auto block h-full w-full bg-panel"
          >
            <p className="p-6 text-small">
              This browser will not display the page.{" "}
              <a
                href={`/api/documents/${documentId}/file`}
                className="underline underline-offset-2"
              >
                Open {filename}
              </a>{" "}
              to read it alongside the fields.
            </p>
          </object>
        ) : (
          /* eslint-disable-next-line @next/next/no-img-element --
             next/image wants a known width and a loader; this is a private blob
             streamed through a route, at a size only the browser knows. */
          <img
            id="review-document-image"
            src={`/api/documents/${documentId}/file`}
            alt={`Page of ${filename}`}
            // maxWidth none because Tailwind's preflight caps images at 100% of
            // their container, which would silently pin zoom at fit.
            style={{ width: `${zoom * 100}%`, maxWidth: "none" }}
            className="mx-auto block bg-panel shadow-[0_1px_0_var(--rule)]"
          />
        )}
      </div>

      <div className="flex items-center justify-between border-t border-rule bg-panel px-6 py-3">
        <span className="font-data text-micro text-muted">page 1 of 1</span>

        {/* The PDF viewer brings its own zoom; two sets of controls doing the
            same job, one of them inert, is worse than one. */}
        <div className={`flex items-center gap-1 ${isPdf ? "hidden" : ""}`}>
          <button
            type="button"
            onClick={() => changeZoom(1)}
            className="px-3 py-1 text-small text-muted hover:text-ink"
          >
            fit
          </button>
          <button
            type="button"
            onClick={() => changeZoom(zoom - ZOOM_STEP)}
            aria-label="Zoom out"
            className="px-3 py-1 text-small text-muted hover:text-ink"
          >
            −
          </button>
          <button
            type="button"
            onClick={() => changeZoom(zoom + ZOOM_STEP)}
            aria-label="Zoom in"
            className="px-3 py-1 text-small text-muted hover:text-ink"
          >
            +
          </button>
        </div>
      </div>

      {/* specs/design.md's quality floor asks the region outline to have a text
          alternative. There is no outline now, so this says what is true. */}
      <span className="sr-only" aria-live="polite">
        {focused
          ? `${labelFor(focused.name)} is focused. The page is shown alongside it.`
          : ""}
      </span>
    </section>
  );
}

function labelFor(name: string): string {
  return name.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}
