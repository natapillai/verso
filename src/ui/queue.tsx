import type { QueueDocument, QueueSummary } from "@/server/queue";

/*
  The queue, on the landing page.

  Same rules as the field column in specs/design.md: state is carried by the
  weight of the left edge, never by colour. A document with fields still owed
  attention gets a two pixel --ink edge, exactly as a needs_review field does;
  everything else gets none. --mark is not used here at all — it has two places
  in this product and this is not one of them.

  One row per document, the filename first, because that is what a person is
  looking for when they come back to a batch they were part way through.
*/

/** What this document wants from you, in the product's own words. */
function describe(document: QueueDocument): string {
  if (document.state === "failed") return "Could not read this page";
  if (document.state === "received" || document.state === "extracting") {
    return "Reading the page";
  }
  if (document.state === "completed") return "Done";
  if (document.outstanding === 0) return "Nothing needs you";
  return `${document.outstanding} field${document.outstanding === 1 ? "" : "s"} need${
    document.outstanding === 1 ? "s" : ""
  } you`;
}

function Row({ document }: { document: QueueDocument }) {
  const waiting = document.outstanding > 0;

  return (
    <li
      className={
        waiting
          ? "border-l-2 border-solid border-ink"
          : "border-l-2 border-solid border-transparent"
      }
    >
      <a
        href={`/review/${document.id}`}
        className="flex items-baseline justify-between gap-4 px-5 py-4 hover:bg-ground"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-body">{document.filename}</span>
          <span className="text-small text-muted">
            Batch {document.batchSeq}
            {document.batchLabel ? ` · ${document.batchLabel}` : ""}
            {document.corrected > 0
              ? ` · ${document.corrected} corrected`
              : ""}
          </span>
        </span>
        <span className="shrink-0 text-small text-muted">{describe(document)}</span>
      </a>
    </li>
  );
}

export function Queue({ queue }: { queue: QueueSummary }) {
  if (queue.documents.length === 0) {
    return (
      <section aria-label="Queue" className="mt-10">
        <p className="border border-rule bg-panel px-5 py-8 text-center text-muted">
          Nothing to review. Upload a batch to start.
        </p>
      </section>
    );
  }

  return (
    <section aria-label="Queue" className="mt-10">
      <div className="flex items-baseline justify-between gap-4 border-b border-rule pb-2">
        <h2 className="font-display text-h2">To review</h2>
        <p className="text-small text-muted">
          {queue.waiting > 0
            ? `${queue.waiting} waiting · ${queue.completed} done`
            : `${queue.completed} of ${queue.total} done`}
        </p>
      </div>

      <ul className="divide-y divide-rule border border-t-0 border-rule bg-panel">
        {queue.documents.map((document) => (
          <Row key={document.id} document={document} />
        ))}
      </ul>
    </section>
  );
}
