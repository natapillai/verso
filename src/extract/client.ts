import Anthropic from "@anthropic-ai/sdk";
import { extractionPrompt } from "./prompt";
import type { ModelTransport } from "./extract";

/*
  The model, behind one function.

  specs/extraction.md: one call per document, the page as a base64 image block
  alongside the instruction. No OCR, no chunking, no chain. The small fast model,
  max output capped, twenty second timeout.
*/

/** "the small fast one" from specs/extraction.md. Vision capable, cheapest tier. */
export const EXTRACTION_MODEL = "claude-haiku-4-5";

/** The output is eight small objects. Anything larger is a runaway. */
const MAX_OUTPUT_TOKENS = 2048;

export const REQUEST_TIMEOUT_MS = 20_000;

/** Media types the vision API accepts. PDFs go through the document block instead. */
const IMAGE_MEDIA_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;

type ImageMediaType = (typeof IMAGE_MEDIA_TYPES)[number];

function isImageMediaType(value: string): value is ImageMediaType {
  return (IMAGE_MEDIA_TYPES as readonly string[]).includes(value);
}

/** Whether there is a key to call with. Checked before spending an attempt. */
export function isModelAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/**
 * The real transport. Retries are this codebase's job, not the SDK's, so
 * maxRetries is zero: otherwise two attempts here would become six requests
 * against a twenty second budget.
 */
export function anthropicTransport(): ModelTransport {
  const client = new Anthropic({
    timeout: REQUEST_TIMEOUT_MS,
    maxRetries: 0,
  });

  return async ({ bytes, mimeType, signal }) => {
    const data = Buffer.from(bytes).toString("base64");

    const response = await client.messages.create(
      {
        model: EXTRACTION_MODEL,
        max_tokens: MAX_OUTPUT_TOKENS,
        messages: [
          {
            role: "user",
            content: [
              documentBlock(data, mimeType),
              { type: "text", text: extractionPrompt() },
            ],
          },
        ],
      },
      { signal },
    );

    return {
      text: response.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join(""),
      model: response.model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };
  };
}

function documentBlock(data: string, mimeType: string) {
  if (isImageMediaType(mimeType)) {
    return {
      type: "image" as const,
      source: { type: "base64" as const, media_type: mimeType, data },
    };
  }

  // specs/extraction.md sends the first two pages of a multi page document and no
  // more; the API applies that page budget itself for a PDF block.
  return {
    type: "document" as const,
    source: { type: "base64" as const, media_type: "application/pdf" as const, data },
  };
}
