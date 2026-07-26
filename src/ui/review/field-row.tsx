"use client";

import { forwardRef } from "react";
import type { ReviewField } from "@/server/review";

/*
  One field.

  specs/design.md: confidence is shown as weight, not colour. The left edge is
  the whole signal —

    auto_accepted   none
    needs_review    2px solid --ink
    sampled         2px dashed --ink
    confirmed       none, it is settled
    corrected       --mark

  That last one is the second and final use of --mark in this slice. Colour is
  reserved so the one red thing on the screen means something.
*/

import { FIELD_LABELS } from "@/ui/field-labels";

/** The left edge. Weight and dash carry status; only `corrected` carries colour. */
function edgeClass(status: ReviewField["status"]): string {
  switch (status) {
    case "needs_review":
      return "border-l-2 border-solid border-ink";
    case "sampled":
      return "border-l-2 border-dashed border-ink";
    case "corrected":
      return "border-l-2 border-solid border-mark";
    default:
      return "border-l-2 border-solid border-transparent";
  }
}

type Props = {
  field: ReviewField;
  focused: boolean;
  editing: boolean;
  draft: string;
  onFocus: () => void;
  onDraftChange: (value: string) => void;
  onCommit: () => void;
  onCancel: () => void;
  onConfirm: () => void;
  onBeginEdit: () => void;
};

export const FieldRow = forwardRef<HTMLLIElement, Props>(function FieldRow(
  {
    field,
    focused,
    editing,
    draft,
    onFocus,
    onDraftChange,
    onCommit,
    onCancel,
    onConfirm,
    onBeginEdit,
  },
  ref,
) {
  const label = FIELD_LABELS[field.name] ?? field.name;
  const settled = field.status === "confirmed" || field.status === "corrected";

  return (
    <li
      ref={ref}
      data-field-row={field.name}
      className={`${edgeClass(field.status)} bg-panel px-5 py-4 ${
        focused ? "bg-ground" : ""
      }`}
      style={
        field.status === "corrected"
          ? { transition: `background-color var(--wash) var(--ease-out)` }
          : undefined
      }
    >
      <div className="flex items-baseline justify-between gap-3">
        <span id={`label-${field.id}`} className="text-small text-muted">
          {label}
        </span>
        {field.confidence !== null && (
          <span className="font-data text-micro text-muted tabular-nums">
            {Math.round(field.confidence * 100)}%
          </span>
        )}
      </div>

      {editing ? (
        <input
          autoFocus
          value={draft}
          aria-labelledby={`label-${field.id}`}
          onChange={(e) => onDraftChange(e.target.value)}
          onBlur={onCommit}
          className="mt-1 w-full border-b border-ink bg-transparent text-body tabular-nums outline-none"
        />
      ) : (
        <button
          type="button"
          onFocus={onFocus}
          onClick={onFocus}
          aria-labelledby={`label-${field.id}`}
          className="mt-1 block w-full text-left text-body tabular-nums"
        >
          {field.value ?? <span className="text-muted">Empty</span>}
        </button>
      )}

      {field.status === "needs_review" && !editing && (
        <p className="mt-1 text-small text-muted">needs you</p>
      )}

      {/*
        Success criterion 3: a correction, the original model value, and who
        changed it all survive a reload. Answering that on the row keeps it where
        the reviewer already is, instead of behind a separate log.
      */}
      {field.correction && (
        <p className="mt-1 text-small text-muted">
          was {field.correction.previousValue ?? "empty"} · {field.correction.reviewer}
        </p>
      )}

      {/* Every shortcut also has a visible control: a keyboard only interface is
          a training burden. */}
      {focused && !editing && !settled && (
        <div className="mt-2 flex gap-3">
          <button
            type="button"
            onClick={onConfirm}
            className="text-small text-ink underline underline-offset-2"
          >
            Confirm
          </button>
          <button
            type="button"
            onClick={onBeginEdit}
            className="text-small text-muted underline underline-offset-2"
          >
            Correct
          </button>
        </div>
      )}

      {editing && (
        <div className="mt-2 flex gap-3">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={onCommit}
            className="text-small text-ink underline underline-offset-2"
          >
            Save
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={onCancel}
            className="text-small text-muted underline underline-offset-2"
          >
            Cancel
          </button>
        </div>
      )}
    </li>
  );
});
