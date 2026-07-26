"use client";

import { useState } from "react";
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
    } catch {
      setState({
        kind: "failed",
        message: "The upload could not reach the server. Check your connection.",
      });
    }
  }

  const documents =
    state.kind === "sent" || state.kind === "extracting" ? state.documents : [];

  return (
    <>
      <form onSubmit={onSubmit}>
        <label htmlFor="file">Invoice files</label>
        <input
          id="file"
          name="file"
          type="file"
          multiple
          required
          accept={ACCEPTED_MIME_TYPES.join(",")}
        />
        <button
          type="submit"
          disabled={state.kind === "sending" || state.kind === "extracting"}
        >
          {state.kind === "sending" ? "Uploading" : "Upload"}
        </button>
      </form>

      {state.kind === "failed" && <p role="alert">{state.message}</p>}

      {documents.length > 0 && (
        <ul>
          {documents.map((document) => (
            <li key={document.id}>
              <span>{document.filename}</span>{" "}
              <span>
                {document.duplicate
                  ? "Already have this one. Opened the existing document."
                  : "Added."}
              </span>{" "}
              <code>{document.contentHash.slice(0, 12)}</code>{" "}
              <span>{describeExtraction(state, document.id)}</span>{" "}
              <a href={`/review/${document.id}`}>Review</a>
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
