"use client";

import { useLayoutEffect, useRef } from "react";
import type { ReviewField } from "@/server/review";

/*
  The signature element, from specs/design.md.

  When a field takes focus, a thin --rule line is drawn from the left edge of the
  field row, across the gutter, to the region on the document, which is outlined
  in --mark. The line follows if the document is scrolled.

  Why it earns the effort: a highlight box alone makes the reviewer's eye search
  for it. The tether removes that search. It is the difference between the tool
  telling you where to look and the tool making you find it, and across two
  hundred documents that difference is the product.

  Geometry is written straight to the SVG rather than held in React state. The
  line follows the document as it scrolls, so this recomputes on every scroll
  frame; a re-render per frame to move two shapes would be waste. The elements
  arrive through a getter called inside the effect, because refs are empty during
  the first render and reading them there would draw nothing on arrival.

  The outline is the first of the two uses of --mark in this slice; the other is
  the left edge of a corrected field.
*/

export type TetherElements = {
  image: HTMLImageElement;
  row: HTMLElement;
};

type Props = {
  getElements: () => TetherElements | null;
  field: ReviewField | null;
  /** Bumped whenever the document scrolls, zooms, or the window resizes. */
  tick: number;
  /** Below 1000px the layout stacks and a line across it would be a lie. */
  stacked: boolean;
};

export function Tether({ getElements, field, tick, stacked }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const groupRef = useRef<SVGGElement>(null);
  const rectRef = useRef<SVGRectElement>(null);
  const lineRef = useRef<SVGLineElement>(null);
  const lastFieldId = useRef<string | null>(null);

  useLayoutEffect(() => {
    const svg = svgRef.current;
    const group = groupRef.current;
    const rect = rectRef.current;
    const line = lineRef.current;
    if (!svg || !group || !rect || !line) return;

    const elements = getElements();
    const box = field?.box;

    // No region to point at: the model read a value but could not place it.
    if (!elements || !box || !elements.image.clientWidth) {
      group.style.visibility = "hidden";
      return;
    }

    /*
      The SVG is positioned inset-0 inside the split, so its own rect is the
      coordinate space everything else is measured against.

      Measuring against the parent element instead looks equivalent and is not:
      React attaches refs child first, so a ref on the containing div is still
      null while this effect runs on the first commit, and the tether would never
      draw until something unrelated re-rendered.
    */
    const base = svg.getBoundingClientRect();
    const page = elements.image.getBoundingClientRect();
    const row = elements.row.getBoundingClientRect();

    const x = page.left - base.left + box.x0 * page.width;
    const y = page.top - base.top + box.y0 * page.height;
    const width = (box.x1 - box.x0) * page.width;
    const height = (box.y1 - box.y0) * page.height;

    group.style.visibility = "visible";
    rect.setAttribute("x", String(x));
    rect.setAttribute("y", String(y));
    rect.setAttribute("width", String(Math.max(width, 2)));
    rect.setAttribute("height", String(Math.max(height, 2)));

    if (stacked) {
      line.style.display = "none";
      return;
    }

    // From the region's right edge, across the gutter, to the row's left edge.
    const x1 = x + width;
    const y1 = y + height / 2;
    const x2 = row.left - base.left;
    const y2 = row.top - base.top + row.height / 2;
    const length = Math.hypot(x2 - x1, y2 - y1);

    line.style.display = "";
    line.setAttribute("x1", String(x1));
    line.setAttribute("y1", String(y1));
    line.setAttribute("x2", String(x2));
    line.setAttribute("y2", String(y2));
    line.style.strokeDasharray = String(length);
    // The keyframe draws from this length down to zero.
    line.style.setProperty("--tether-length", String(length));

    // Draw only when focus moves to a different field. Restarting the animation
    // on every scroll frame would make the line flicker instead of follow.
    if (lastFieldId.current !== field.id) {
      lastFieldId.current = field.id;
      line.style.animation = "none";
      // Force a reflow so the animation restarts rather than being coalesced.
      void line.getBoundingClientRect();
      line.style.animation = "tether-draw var(--tether-draw) var(--ease-out) forwards";
    }
  }, [getElements, field, tick, stacked]);

  return (
    <svg
      ref={svgRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-10 h-full w-full"
    >
      <g ref={groupRef} style={{ visibility: "hidden" }}>
        <rect ref={rectRef} fill="none" stroke="var(--mark)" strokeWidth={2} />
        <line
          ref={lineRef}
          stroke="var(--rule)"
          strokeWidth={1}
          style={{ strokeDashoffset: 0 }}
        />
      </g>

      <style>{`
        @keyframes tether-draw {
          from { stroke-dashoffset: var(--tether-length, 9999); }
          to { stroke-dashoffset: 0; }
        }
      `}</style>
    </svg>
  );
}
