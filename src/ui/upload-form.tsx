"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ACCEPTED_MIME_TYPES } from "@/domain/upload";
import { downscale } from "./downscale";
import type { UploadResponse, UploadedDocument } from "@/app/api/upload/route";

type Extraction = { source: "model" | "fallback"; fieldsWritten: number };

type State =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "extracting"; documents: UploadedDocument[] }
  | {
      kind: "sent";
      documents: UploadedDocument[];
      extractions: Record<string, Extraction | "failed">;
    }
  | { kind: "failed"; message: string };

export function UploadForm() {
  const [state, setState] = useState<State>({ kind: "idle" });
  const [chosen, setChosen] = useState(0);
  const router = useRouter();

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState({ kind: "sending" });

    const input = event.currentTarget.elements.namedItem("file");
    const chosen =
      input instanceof HTMLInputElement && input.files ? [...input.files] : [];

    try {
      // Shrink before sending: keeps a phone photo under Vercel's 4.5MB body cap
      // and cuts what the model is charged to read. See src/ui/downscale.ts.
      const form = new FormData();
      for (const file of chosen) {
        form.append("file", await downscale(file));
      }

      const response = await fetch("/api/upload", { method: "POST", body: form });
      const body: unknown = await response.json();

      if (!response.ok) {
        const message =
          typeof body === "object" && body !== null && "error" in body
            ? String((body as { error: unknown }).error)
            : "That upload did not land. Try it again.";
        setState({ kind: "failed", message });
        return;
      }

      const { documents } = body as UploadResponse;
      setState({ kind: "extracting", documents });

      // Extraction is a separate request on purpose: upload accepts the bytes
      // and answers straight away, reading the page happens after.
      const extractions = await extractAll(documents);
      setState({ kind: "sent", documents, extractions });

      // The queue below is server rendered, so it does not know about anything
      // uploaded since the page loaded until it is asked again.
      router.refresh();
    } catch {
      setState({
        kind: "failed",
        message: "The upload could not reach the server. Check your connection.",
      });
    }
  }

  const documents =
    state.kind === "sent" || state.kind === "extracting" ? state.documents : [];

  const busy = state.kind === "sending" || state.kind === "extracting";

  return (
    <>
      <form
        onSubmit={onSubmit}
        className="mt-8 flex flex-wrap items-center gap-4 border border-rule bg-panel px-5 py-4"
      >
        {/*
          The native control renders its own button and "No file chosen" text,
          which cannot be styled and reads as browser chrome sitting in the middle
          of the page. The input keeps doing the work and keeps its label; it is
          just moved out of sight, with the focus ring drawn on the visible
          control instead so the quality floor in specs/design.md still holds.
        */}
        <input
          id="file"
          name="file"
          type="file"
          multiple
          required
          accept={ACCEPTED_MIME_TYPES.join(",")}
          onChange={(event) => setChosen(event.currentTarget.files?.length ?? 0)}
          className="peer sr-only"
        />
        <label
          htmlFor="file"
          className="cursor-pointer border border-rule bg-ground px-3 py-1 text-small text-ink peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink"
        >
          Choose invoices
        </label>
        <span className="min-w-0 flex-1 truncate text-small text-muted">
          {chosen === 0
            ? "PDF or an image of a page"
            : `${chosen} file${chosen === 1 ? "" : "s"} ready`}
        </span>
        <button
          type="submit"
          disabled={busy}
          className="border border-ink px-4 py-1 text-small text-ink disabled:border-rule disabled:text-muted"
        >
          {state.kind === "sending"
            ? "Uploading"
            : state.kind === "extracting"
              ? "Reading"
              : "Upload"}
        </button>
      </form>

      {state.kind === "failed" && (
        <p role="alert" className="mt-3 text-small text-ink">
          {state.message}
        </p>
      )}

      {/*
        What this upload just did, which is a different question from what is in
        the queue. Scoped with data-upload-results because the queue below is
        also a list of documents and a spec asserting on "the list" needs to say
        which one it means.
      */}
      {documents.length > 0 && (
        <ul data-upload-results className="mt-4 divide-y divide-rule border border-rule bg-panel">
          {documents.map((document) => (
            <li key={document.id} className="px-5 py-3">
              <span className="text-body">{document.filename}</span>{" "}
              <span className="text-small text-muted">
                {document.duplicate
                  ? "Already have this one. Opened the existing document."
                  : "Added."}
              </span>{" "}
              <code className="font-data text-micro text-muted">
                {document.contentHash.slice(0, 12)}
              </code>{" "}
              <span className="text-small text-muted">
                {describeExtraction(state, document.id)}
              </span>{" "}
              <a
                href={`/review/${document.id}`}
                className="text-small underline underline-offset-2"
              >
                Review
              </a>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

async function extractAll(
  documents: UploadedDocument[],
): Promise<Record<string, Extraction | "failed">> {
  const entries = await Promise.all(
    documents.map(async (document) => {
      try {
        const response = await fetch(`/api/documents/${document.id}/extract`, {
          method: "POST",
        });
        if (!response.ok) return [document.id, "failed" as const] as const;
        const result = (await response.json()) as Extraction;
        return [document.id, result] as const;
      } catch {
        return [document.id, "failed" as const] as const;
      }
    }),
  );

  return Object.fromEntries(entries);
}

function describeExtraction(state: State, documentId: string): string {
  if (state.kind === "extracting") return "Reading the page";
  if (state.kind !== "sent") return "";

  const extraction = state.extractions[documentId];
  if (!extraction) return "";
  if (extraction === "failed") {
    return "Could not read this page. The fields are blank and yours to fill.";
  }
  if (extraction.source === "fallback") {
    return "Filling fields automatically is off right now. Everything still works, it is just manual.";
  }

  return `${extraction.fieldsWritten} fields filled.`;
}
