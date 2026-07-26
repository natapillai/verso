"use client";

import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import type { ReviewField } from "@/server/review";

/*
  The page itself, on the left.

  It scrolls and zooms independently of the field column, because the reviewer's
  hands live on the right and the document should never drag the fields out of
  reach. Zoom is fit, minus, plus — exactly the three controls in the mockup.
  TASKS.md has zoom second on the cut list, so it stays small on purpose.

  No colour is spent here. The focused region's outline is drawn by the tether
  overlay, so the line and the box share one coordinate space.
*/

export type DocumentPanelHandle = {
  /** Below 1000px the tether cannot be drawn, so the region is scrolled to instead. */
  scrollToField: (field: ReviewField) => void;
  /** The tether measures against the rendered page. */
  getImage: () => HTMLImageElement | null;
};

type Props = {
  documentId: string;
  filename: string;
  focused: ReviewField | null;
  /** Told whenever the image moves, so the tether can be redrawn. */
  onViewportChange: () => void;
};

const ZOOM_STEP = 0.25;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;

export const DocumentPanel = forwardRef<DocumentPanelHandle, Props>(
  function DocumentPanel({ documentId, filename, focused, onViewportChange }, ref) {
    const [zoom, setZoom] = useState(1);
    const scrollRef = useRef<HTMLDivElement>(null);
    const imageRef = useRef<HTMLImageElement>(null);

    useImperativeHandle(ref, () => ({
      scrollToField(field) {
        const image = imageRef.current;
        const scroller = scrollRef.current;
        if (!image || !scroller || !field.box) return;

        const top = image.offsetTop + field.box.y0 * image.clientHeight;
        scroller.scrollTo({
          top: top - scroller.clientHeight / 2,
          behavior: "smooth",
        });
      },
      getImage: () => imageRef.current,
    }));

    function changeZoom(next: number) {
      setZoom(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next)));
      // The image resizes on the next paint; let the tether catch up after it.
      requestAnimationFrame(onViewportChange);
    }

    return (
      <section
        className="flex min-h-0 flex-col border-rule lg:border-r"
        aria-label="Document"
      >
        <div
          ref={scrollRef}
          onScroll={onViewportChange}
          className="min-h-0 flex-1 overflow-auto bg-ground p-6"
        >
          {/* eslint-disable-next-line @next/next/no-img-element --
              next/image wants a known width and a loader; this is a private blob
              streamed through a route, at a size only the browser knows. */}
          <img
            ref={imageRef}
            id="review-document-image"
            src={`/api/documents/${documentId}/file`}
            alt={`Page of ${filename}`}
            onLoad={onViewportChange}
            // maxWidth none because Tailwind's preflight caps images at 100% of
            // their container, which would silently pin zoom at fit.
            style={{ width: `${zoom * 100}%`, maxWidth: "none" }}
            className="mx-auto block bg-panel shadow-[0_1px_0_var(--rule)]"
          />
        </div>

        <div className="flex items-center justify-between border-t border-rule bg-panel px-6 py-3">
          <span className="font-data text-micro text-muted">page 1 of 1</span>

          <div className="flex items-center gap-1">
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

        {/* The region outline lives in the tether overlay so it shares one
            coordinate space with the line. See tether.tsx. */}
        <span className="sr-only" aria-live="polite">
          {focused?.box
            ? `${labelFor(focused.name)} is highlighted on the page.`
            : focused
              ? `${labelFor(focused.name)} was not located on the page.`
              : ""}
        </span>
      </section>
    );
  },
);

function labelFor(name: string): string {
  return name.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}
