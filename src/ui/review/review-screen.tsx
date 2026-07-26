"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import type { ReviewDocument, ReviewField } from "@/server/review";
import { DocumentPanel, type DocumentPanelHandle } from "./document-panel";
import { FieldColumn } from "./field-column";
import { ShortcutSheet } from "./shortcut-sheet";
import { Tether } from "./tether";
import { useReviewKeyboard } from "./use-review-keyboard";

/*
  The review screen.

  Document left, fields right, roughly three to two. Below 1000px they stack and
  the tether degrades to a scroll plus an outline, which specs/design.md asks for
  rather than faking a line across a stacked layout.

  The path this is built around: eight Enters and one Cmd Enter. Confirmations
  are applied locally the moment they are pressed and reconciled with the server
  afterwards, because waiting on a round trip between Enters would put latency
  into the only interaction that is measured.
*/

const STACK_BELOW = 1000;

/** Statuses that still owe the reviewer attention. Invariant 3. */
function isOutstanding(field: ReviewField): boolean {
  return field.status === "needs_review" || field.status === "sampled";
}

export function ReviewScreen({
  review,
  reviewer,
}: {
  review: ReviewDocument;
  reviewer: string;
}) {
  const router = useRouter();

  const [fields, setFields] = useState(review.fields);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [tick, setTick] = useState(0);
  const [stacked, setStacked] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<(HTMLLIElement | null)[]>([]);
  const panelRef = useRef<DocumentPanelHandle>(null);
  /** Guards the Enter-then-blur double commit. See commitEdit. */
  const committing = useRef(false);

  const focused = fields[focusedIndex] ?? null;

  useEffect(() => {
    const query = window.matchMedia(`(max-width: ${STACK_BELOW - 1}px)`);
    const sync = () => setStacked(query.matches);
    sync();
    query.addEventListener("change", sync);

    const onResize = () => setTick((t) => t + 1);
    window.addEventListener("resize", onResize);

    return () => {
      query.removeEventListener("change", sync);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  // Stacked layouts get a scroll to the region instead of a line to it.
  useEffect(() => {
    if (stacked && focused) panelRef.current?.scrollToField(focused);
  }, [stacked, focused]);

  /*
    Land with the first field focused.

    Without this the reviewer arrives with focus on the body, outside the key
    handler, and the first Enter goes nowhere — they have to click a field before
    the keyboard does anything. That is friction in the one path this screen is
    built around, and it also applies on arrival at the next document after a
    completion, which is where the rhythm matters most.
  */
  useEffect(() => {
    rowRefs.current[0]?.querySelector("button")?.focus();
  }, [review.id]);

  const focusRow = useCallback((index: number) => {
    rowRefs.current[index]?.querySelector("button")?.focus();
  }, []);

  /*
    Handed to the tether and called inside its layout effect, never during
    render: refs are empty on the first pass, and reading them there would leave
    the line undrawn until something unrelated re-rendered.
  */
  const getTetherElements = useCallback(() => {
    const row = rowRefs.current[focusedIndex];
    const image = panelRef.current?.getImage() ?? null;
    if (!row || !image) return null;
    return { image, row };
  }, [focusedIndex]);

  const patch = useCallback((index: number, next: Partial<ReviewField>) => {
    setFields((current) =>
      current.map((field, i) => (i === index ? { ...field, ...field, ...next } : field)),
    );
  }, []);

  const confirmField = useCallback(
    async (index: number) => {
      const field = fields[index];
      if (!field || field.status === "corrected" || field.status === "confirmed") return;

      const previous = field.status;
      patch(index, { status: "confirmed" });

      const response = await fetch(`/api/fields/${field.id}/confirm`, { method: "POST" });
      if (!response.ok) {
        patch(index, { status: previous });
        setMessage("That confirmation did not save. Try it again.");
      }
    },
    [fields, patch],
  );

  const confirmAndAdvance = useCallback(() => {
    void confirmField(focusedIndex);
    const next = Math.min(focusedIndex + 1, fields.length - 1);
    setFocusedIndex(next);
    focusRow(next);
  }, [confirmField, focusedIndex, fields.length, focusRow]);

  const beginEdit = useCallback(
    (seed?: string) => {
      const field = fields[focusedIndex];
      if (!field) return;
      setDraft(seed ?? field.value ?? "");
      setEditing(true);
    },
    [fields, focusedIndex],
  );

  const cancelEdit = useCallback(() => {
    // Escape abandons the correction and restores the model value.
    setEditing(false);
    setDraft("");
    focusRow(focusedIndex);
  }, [focusedIndex, focusRow]);

  const commitEdit = useCallback(async () => {
    const field = fields[focusedIndex];
    if (!field) return;

    /*
      Enter commits, which unmounts the input, which fires blur, which commits
      again. Both requests read the field before either wrote, so one edit
      produced two correction rows — and a value counted twice against the model
      is a value the accuracy numbers get wrong. One commit per edit.
    */
    if (committing.current) return;
    committing.current = true;

    const next = draft.trim() === "" ? null : draft.trim();
    setEditing(false);

    // Typing then landing on the same value is agreement, not disagreement.
    if (next === (field.value ?? null)) {
      committing.current = false;
      focusRow(focusedIndex);
      return;
    }

    const previousValue = field.value;
    patch(focusedIndex, {
      value: next,
      status: "corrected",
      correction: { previousValue, reviewer, at: new Date().toISOString() },
    });
    focusRow(focusedIndex);

    const response = await fetch(`/api/fields/${field.id}/correct`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ value: next }),
    });

    if (!response.ok) {
      patch(focusedIndex, { value: previousValue, status: field.status, correction: null });
      setMessage("That correction did not save. Try it again.");
    }

    committing.current = false;
  }, [draft, fields, focusedIndex, focusRow, patch, reviewer]);

  const confirmAll = useCallback(() => {
    fields.forEach((field, index) => {
      if (isOutstanding(field)) void confirmField(index);
    });
  }, [fields, confirmField]);

  const complete = useCallback(async () => {
    setMessage(null);

    const response = await fetch(`/api/documents/${review.id}/complete`, {
      method: "POST",
    });
    const body = (await response.json()) as {
      nextDocumentId?: string | null;
      error?: string;
    };

    if (!response.ok) {
      // Invariant 3: the message names the outstanding fields.
      setMessage(body.error ?? "Could not complete this document.");
      return;
    }

    if (body.nextDocumentId) {
      // typedRoutes cannot know a uuid at build time; the shape is checked above.
      router.push(`/review/${body.nextDocumentId}` as Route);
    } else {
      router.refresh();
    }
  }, [review.id, router]);

  const onKeyDown = useReviewKeyboard({
    editing,
    onConfirmAndAdvance: confirmAndAdvance,
    onBeginEdit: beginEdit,
    onCommitEdit: () => void commitEdit(),
    onCancelEdit: cancelEdit,
    onComplete: () => void complete(),
    onToggleShortcuts: () => setShowShortcuts((open) => !open),
  });

  const outstanding = fields.filter(isOutstanding).length;
  const done = review.state === "completed";

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-baseline justify-between gap-4 border-b border-rule bg-panel px-6 py-3">
        <span className="font-display text-h2">VERSO</span>
        <span className="text-small text-muted">
          Batch {review.batchSeq}
          {review.batchLabel ? ` · ${review.batchLabel}` : ""}
        </span>
        <span className="text-small text-muted">
          {review.doneInBatch} of {review.totalInBatch} done
        </span>
        <span className="font-data text-micro text-muted">{reviewer}</span>
      </header>

      {done && (
        <p className="border-b border-rule bg-panel px-6 py-3 text-small" role="status">
          Done. {fields.filter((f) => f.status !== "corrected").length} fields were
          already right.
        </p>
      )}

      <div
        ref={containerRef}
        onKeyDown={onKeyDown}
        className="relative grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[3fr_2fr]"
      >
        <DocumentPanel
          ref={panelRef}
          documentId={review.id}
          filename={review.filename}
          focused={focused}
          onViewportChange={() => setTick((t) => t + 1)}
        />

        <FieldColumn
          fields={fields}
          focusedIndex={focusedIndex}
          editing={editing}
          draft={draft}
          rowRefs={rowRefs}
          outstandingCount={outstanding}
          message={message}
          onFocusField={setFocusedIndex}
          onDraftChange={setDraft}
          onCommitEdit={() => void commitEdit()}
          onCancelEdit={cancelEdit}
          onConfirmField={(index) => void confirmField(index)}
          onBeginEdit={beginEdit}
          onConfirmAll={confirmAll}
          onComplete={() => void complete()}
        />

        <Tether
          getElements={getTetherElements}
          field={focused}
          tick={tick}
          stacked={stacked}
        />
      </div>

      {showShortcuts && <ShortcutSheet onClose={() => setShowShortcuts(false)} />}
    </div>
  );
}
