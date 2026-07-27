"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import type { ReviewDocument, ReviewField } from "@/server/review";
import { DocumentPanel } from "./document-panel";
import { FieldColumn } from "./field-column";
import { ShortcutSheet } from "./shortcut-sheet";
import { useReviewKeyboard } from "./use-review-keyboard";

/*
  The review screen.

  Document left, fields right, roughly three to two. Below 1000px they stack.

  specs/design.md puts a tether here: a line from the focused field to that
  value's region on the page, called out as the one place to spend effort. It was
  built, and it is gone. `pnpm eval:boxes` measures the boxes it drew against
  where the values really are, and 10% of them land on the value. A confident
  outline that is wrong nine times in ten does the opposite of what the tether
  was for. See docs/decisions.md.

  The path this is built around: eight Enters and one Cmd Enter. Confirmations
  are applied locally the moment they are pressed and reconciled with the server
  afterwards, because waiting on a round trip between Enters would put latency
  into the only interaction that is measured.
*/

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
  const [focusedIndex, setFocusedIndexState] = useState(0);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<(HTMLLIElement | null)[]>([]);
  /** Guards the Enter-then-blur double commit. See commitEdit. */
  const committing = useRef(false);

  /*
    Which field is focused is held in a ref as well as in state, and the ref is
    what the actions read.

    The design invites clicking a field and typing straight into it — any
    character begins a correction. Those two events can arrive in the same frame,
    before React has re-rendered, and a handler reading render time state would
    then act on the field that was focused a moment ago: the correction lands on
    the wrong row and writes a correction row against a value the reviewer never
    disagreed with. The same applies to Enter held down through the eight field
    rhythm, where key repeat outruns a render easily.

    State still drives what is drawn. The ref only decides what is acted on.
  */
  const focusedIndexRef = useRef(0);
  const setFocusedIndex = useCallback((index: number) => {
    focusedIndexRef.current = index;
    setFocusedIndexState(index);
  }, []);

  const focused = fields[focusedIndex] ?? null;

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
    Give the row its focus back once an edit is over.

    Committing unmounts the input, and focusing the row in the same breath lands
    on the Save button that is about to be removed with it — after which focus
    falls to the body, outside the key handler, and the keyboard is dead until
    the reviewer clicks something. That is the same failure the landing effect
    above exists to prevent, arriving one step later in the rhythm, and it breaks
    the path the screen is built around: correct a field, then carry on pressing
    Enter. Waiting for the row to be drawn again gives the focus somewhere to go.
  */
  const wasEditing = useRef(false);
  useEffect(() => {
    if (wasEditing.current && !editing) focusRow(focusedIndexRef.current);
    wasEditing.current = editing;
  }, [editing, focusRow]);

  const patch = useCallback((index: number, next: Partial<ReviewField>) => {
    setFields((current) =>
      current.map((field, i) => (i === index ? { ...field, ...next } : field)),
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
    const index = focusedIndexRef.current;
    void confirmField(index);
    const next = Math.min(index + 1, fields.length - 1);
    setFocusedIndex(next);
    focusRow(next);
  }, [confirmField, fields.length, focusRow, setFocusedIndex]);

  const beginEdit = useCallback(
    (seed?: string) => {
      const field = fields[focusedIndexRef.current];
      if (!field) return;
      setDraft(seed ?? field.value ?? "");
      setEditing(true);
    },
    [fields],
  );

  const cancelEdit = useCallback(() => {
    // Escape abandons the correction and restores the model value. Focus comes
    // back to the row through the effect above, once the input is gone.
    setEditing(false);
    setDraft("");
  }, []);

  const commitEdit = useCallback(async () => {
    const index = focusedIndexRef.current;
    const field = fields[index];
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
      return;
    }

    const previousValue = field.value;
    patch(index, {
      value: next,
      status: "corrected",
      correction: { previousValue, reviewer, at: new Date().toISOString() },
    });

    const response = await fetch(`/api/fields/${field.id}/correct`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ value: next }),
    });

    if (!response.ok) {
      patch(index, { value: previousValue, status: field.status, correction: null });
      setMessage("That correction did not save. Try it again.");
    }

    committing.current = false;
  }, [draft, fields, patch, reviewer]);

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
        {/*
          The way back. Without it the only exit from a document is the browser's
          back button, which is not somewhere a reviewer should have to look for
          a control the product should own.
        */}
        <Link
          href="/"
          title="Back to the queue"
          className="font-display text-h2 underline-offset-4 hover:underline"
        >
          VERSO
        </Link>
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
          documentId={review.id}
          filename={review.filename}
          mimeType={review.mimeType}
          focused={focused}
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
      </div>

      {showShortcuts && <ShortcutSheet onClose={() => setShowShortcuts(false)} />}
    </div>
  );
}
