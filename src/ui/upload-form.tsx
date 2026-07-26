"use client";

import { useState } from "react";
import { ACCEPTED_MIME_TYPES } from "@/domain/upload";
import type { UploadResponse, UploadedDocument } from "@/app/api/upload/route";

type State =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent"; documents: UploadedDocument[] }
  | { kind: "failed"; message: string };

export function UploadForm() {
  const [state, setState] = useState<State>({ kind: "idle" });

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState({ kind: "sending" });

    const form = new FormData(event.currentTarget);

    try {
      const response = await fetch("/api/upload", {
        method: "POST",
        body: form,
      });
      const body: unknown = await response.json();

      if (!response.ok) {
        const message =
          typeof body === "object" && body !== null && "error" in body
            ? String((body as { error: unknown }).error)
            : "That upload did not land. Try it again.";
        setState({ kind: "failed", message });
        return;
      }

      setState({ kind: "sent", documents: (body as UploadResponse).documents });
    } catch {
      setState({
        kind: "failed",
        message: "The upload could not reach the server. Check your connection.",
      });
    }
  }

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
        <button type="submit" disabled={state.kind === "sending"}>
          {state.kind === "sending" ? "Uploading" : "Upload"}
        </button>
      </form>

      {state.kind === "failed" && <p role="alert">{state.message}</p>}

      {state.kind === "sent" && (
        <ul>
          {state.documents.map((document) => (
            <li key={document.id}>
              <span>{document.filename}</span>{" "}
              <span>
                {document.duplicate
                  ? "Already have this one. Opened the existing document."
                  : "Added."}
              </span>{" "}
              <code>{document.contentHash.slice(0, 12)}</code>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
