"use client";

/*
  The `?` sheet. Every shortcut also has a visible control elsewhere on the
  screen, so this is a reminder rather than the only way in — specs/design.md is
  explicit that a keyboard only interface is a training burden.
*/

const SHORTCUTS: [string, string][] = [
  ["Tab / Shift Tab", "Move between fields"],
  ["Enter", "Confirm the focused field and advance"],
  ["Any character", "Begin correcting the focused field"],
  ["Escape", "Abandon the correction, restore the model value"],
  ["Cmd or Ctrl Enter", "Complete the document"],
  ["?", "This sheet"],
];

export function ShortcutSheet({ onClose }: { onClose: () => void }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      className="fixed inset-0 z-20 flex items-center justify-center bg-ink/20 p-6"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md border border-rule bg-panel p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="font-display text-h2">Shortcuts</h2>

        <dl className="mt-4">
          {SHORTCUTS.map(([key, action]) => (
            <div key={key} className="flex justify-between gap-6 border-t border-rule py-2">
              <dt className="font-data text-micro text-muted">{key}</dt>
              <dd className="text-small">{action}</dd>
            </div>
          ))}
        </dl>

        <button
          type="button"
          autoFocus
          onClick={onClose}
          className="mt-4 text-small text-ink underline underline-offset-2"
        >
          Close
        </button>
      </div>
    </div>
  );
}
