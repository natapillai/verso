import { ExtractedSchema, type Extracted } from "@/domain/fields";

/**
 * Raised when model output cannot be trusted. Two of these in a row send the
 * document to the fallback, and the message is recorded on the extraction row
 * so a failure is visible rather than silent.
 */
export class ExtractionParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExtractionParseError";
  }
}

/** Strips a ```json fence if the model wrapped its output in one. */
const FENCE = /^\s*```(?:json)?\s*\n?([\s\S]*?)\n?\s*```\s*$/;

/**
 * The boundary. Non negotiable 2 in CLAUDE.md: model output is parsed against a
 * Zod schema, and a parse failure is a failure rather than something to repair.
 *
 * The one liberty taken is unwrapping a markdown fence, which is packaging
 * rather than data: no field value is ever coerced, defaulted, reordered, or
 * filled in. If the model returns seven fields, that is a failure and the
 * caller retries or falls back.
 */
export function parseModelOutput(raw: string): Extracted {
  const unwrapped = FENCE.exec(raw)?.[1] ?? raw;

  let json: unknown;
  try {
    json = JSON.parse(unwrapped);
  } catch (error) {
    throw new ExtractionParseError(
      `model output was not JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const result = ExtractedSchema.safeParse(json);
  if (!result.success) {
    throw new ExtractionParseError(
      `model output failed the schema: ${result.error.issues
        .map((issue) => `${issue.path.join(".")} ${issue.message}`)
        .join("; ")}`,
    );
  }

  return result.data;
}
