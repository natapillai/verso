import type { ExtractedField } from "@/domain/fields";
import { fallbackExtract } from "./fallback";
import { imageWidth } from "./image";
import { parseModelOutput } from "./parse";
import { PROMPT_VERSION } from "./prompt";

/*
  The extraction policy, from specs/extraction.md and specs/domain.md:
  two attempts at twenty seconds, then the deterministic fallback.

  The transport is injected so every branch of this policy is testable with no
  network and no key, which is what the `degraded` CI job runs.
*/

/** "Timeout twenty seconds, two attempts, then the fallback." */
export const MAX_ATTEMPTS = 2;

export type ModelTransport = (args: {
  bytes: Uint8Array;
  mimeType: string;
  signal: AbortSignal;
}) => Promise<{
  text: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}>;

export type ExtractionOutcome = {
  source: "model" | "fallback";
  /** Null when the fallback ran, because no model was involved. */
  model: string | null;
  promptVersion: string;
  fields: ExtractedField[];
  /** Attempts spent on the model. Zero when there was no key to spend one. */
  attempt: number;
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  imageWidth: number | null;
  /** Why the model was abandoned. Recorded so a failure is never silent. */
  error: string | null;
};

export type ExtractDocumentArgs = {
  bytes: Uint8Array;
  mimeType: string;
  transport?: ModelTransport;
  /**
   * Text for the fallback to work over. Empty for an image, since there is no
   * OCR step by design — the fallback then returns eight flagged empty fields,
   * which still gets the document to a reviewer.
   */
  fallbackText?: string;
  /** Defaults to whether an API key is present. */
  modelAvailable?: boolean;
  timeoutMs?: number;
};

export async function extractDocument({
  bytes,
  mimeType,
  transport,
  fallbackText = "",
  modelAvailable = true,
  timeoutMs = 20_000,
}: ExtractDocumentArgs): Promise<ExtractionOutcome> {
  const startedAt = Date.now();
  const width = imageWidth(bytes);

  // No key, or no transport wired: do not spend an attempt discovering that.
  if (!modelAvailable || !transport) {
    return fallbackOutcome({
      fallbackText,
      width,
      startedAt,
      attempt: 0,
      error: "no model available",
    });
  }

  let lastError = "";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await withTimeout(
        (signal) => transport({ bytes, mimeType, signal }),
        timeoutMs,
      );

      // Throws on anything that is not exactly the contract. Not repaired.
      const parsed = parseModelOutput(response.text);

      return {
        source: "model",
        model: response.model,
        promptVersion: PROMPT_VERSION,
        fields: parsed.fields,
        attempt,
        latencyMs: Date.now() - startedAt,
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        imageWidth: width,
        error: null,
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }

  return fallbackOutcome({
    fallbackText,
    width,
    startedAt,
    attempt: MAX_ATTEMPTS,
    error: lastError,
  });
}

function fallbackOutcome({
  fallbackText,
  width,
  startedAt,
  attempt,
  error,
}: {
  fallbackText: string;
  width: number | null;
  startedAt: number;
  attempt: number;
  error: string;
}): ExtractionOutcome {
  return {
    source: "fallback",
    model: null,
    promptVersion: PROMPT_VERSION,
    fields: fallbackExtract(fallbackText),
    attempt,
    latencyMs: Date.now() - startedAt,
    inputTokens: null,
    outputTokens: null,
    imageWidth: width,
    error,
  };
}

/**
 * The twenty second budget, enforced here rather than trusted to the SDK, so the
 * policy holds for any transport including the stubs the tests inject.
 */
async function withTimeout<T>(
  run: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await Promise.race([
      run(controller.signal),
      new Promise<never>((_, reject) => {
        controller.signal.addEventListener("abort", () => {
          reject(new Error(`extraction timed out after ${timeoutMs}ms`));
        });
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
