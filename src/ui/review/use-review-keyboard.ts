"use client";

import { useCallback } from "react";

/*
  The bindings from specs/design.md, in one place.

    Tab / Shift Tab   move between fields      (native, deliberately untouched)
    Enter             confirm and advance
    any character     begin correcting
    Escape            abandon, restore the model value
    Cmd/Ctrl Enter    complete the document
    ?                 shortcut sheet

  The path this exists to protect: eight Enters and one Cmd Enter clears a good
  document. Everything here is arranged so nothing gets in the way of that.

  Tab is left to the browser on purpose. Reimplementing it would mean
  reimplementing focus order, and the native behaviour is what a screen reader
  and a keyboard user already expect.
*/

export type ReviewKeyHandlers = {
  editing: boolean;
  onConfirmAndAdvance: () => void;
  onBeginEdit: (seed: string) => void;
  onCommitEdit: () => void;
  onCancelEdit: () => void;
  onComplete: () => void;
  onToggleShortcuts: () => void;
};

/** A single printable character, not a chord and not a named key. */
function isPrintable(event: React.KeyboardEvent): boolean {
  return event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey;
}

export function useReviewKeyboard({
  editing,
  onConfirmAndAdvance,
  onBeginEdit,
  onCommitEdit,
  onCancelEdit,
  onComplete,
  onToggleShortcuts,
}: ReviewKeyHandlers) {
  return useCallback(
    (event: React.KeyboardEvent) => {
      // Complete wins everywhere, including mid-correction, so a reviewer never
      // has to think about which mode they are in to finish.
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        onComplete();
        return;
      }

      if (editing) {
        if (event.key === "Enter") {
          event.preventDefault();
          onCommitEdit();
        } else if (event.key === "Escape") {
          event.preventDefault();
          onCancelEdit();
        }
        // Everything else is typing. Leave it alone.
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        onConfirmAndAdvance();
        return;
      }

      if (event.key === "?") {
        event.preventDefault();
        onToggleShortcuts();
        return;
      }

      // Any character starts a correction, seeded with the character typed, so
      // the reviewer never types the first letter twice.
      if (isPrintable(event)) {
        event.preventDefault();
        onBeginEdit(event.key);
      }
    },
    [
      editing,
      onConfirmAndAdvance,
      onBeginEdit,
      onCommitEdit,
      onCancelEdit,
      onComplete,
      onToggleShortcuts,
    ],
  );
}
