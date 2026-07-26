"use client";

import type { RefObject } from "react";
import type { ReviewField } from "@/server/review";
import { FieldRow } from "./field-row";

/*
  The eight fields, on the right.

  A real list with real labels, per the quality floor in specs/design.md: a
  screen reader should get what a sighted reviewer gets. The column never scrolls
  out of reach of the keyboard, which is why it scrolls independently of the
  document rather than the page scrolling as a whole.
*/

type Props = {
  fields: ReviewField[];
  focusedIndex: number;
  editing: boolean;
  draft: string;
  rowRefs: RefObject<(HTMLLIElement | null)[]>;
  outstandingCount: number;
  message: string | null;
  onFocusField: (index: number) => void;
  onDraftChange: (value: string) => void;
  onCommitEdit: () => void;
  onCancelEdit: () => void;
  onConfirmField: (index: number) => void;
  onBeginEdit: (seed?: string) => void;
  onConfirmAll: () => void;
  onComplete: () => void;
};

export function FieldColumn({
  fields,
  focusedIndex,
  editing,
  draft,
  rowRefs,
  outstandingCount,
  message,
  onFocusField,
  onDraftChange,
  onCommitEdit,
  onCancelEdit,
  onConfirmField,
  onBeginEdit,
  onConfirmAll,
  onComplete,
}: Props) {
  return (
    <section className="flex min-h-0 flex-col bg-panel" aria-label="Fields">
      <p className="border-b border-rule px-5 py-4 text-small text-muted" aria-live="polite">
        {outstandingCount === 0
          ? "Nothing needs you."
          : `${outstandingCount} field${outstandingCount === 1 ? "" : "s"} need${
              outstandingCount === 1 ? "s" : ""
            } you`}
      </p>

      <ul className="min-h-0 flex-1 divide-y divide-rule overflow-auto">
        {fields.map((field, index) => (
          <FieldRow
            key={field.id}
            ref={(node) => {
              rowRefs.current[index] = node;
            }}
            field={field}
            focused={index === focusedIndex}
            editing={editing && index === focusedIndex}
            draft={draft}
            onFocus={() => onFocusField(index)}
            onDraftChange={onDraftChange}
            onCommit={onCommitEdit}
            onCancel={onCancelEdit}
            onConfirm={() => onConfirmField(index)}
            onBeginEdit={() => onBeginEdit()}
          />
        ))}
      </ul>

      {message && (
        <p role="alert" className="border-t border-rule px-5 py-3 text-small text-ink">
          {message}
        </p>
      )}

      {/* Visible controls for the two shortcuts that matter most. */}
      <div className="flex items-center gap-4 border-t border-rule px-5 py-4">
        <button
          type="button"
          onClick={onConfirmAll}
          className="text-small text-muted underline underline-offset-2"
        >
          Confirm all
        </button>
        <span className="text-muted">·</span>
        <button
          type="button"
          onClick={onComplete}
          className="text-small text-ink underline underline-offset-2"
        >
          Complete <span className="font-data text-micro">⌘⏎</span>
        </button>
      </div>
    </section>
  );
}
