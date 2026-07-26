import { describe, expect, it } from "vitest";
import { FIELD_NAMES } from "@/domain/fields";
import { ExtractionParseError, parseModelOutput } from "./parse";

/*
  The boundary non negotiable 2 in CLAUDE.md draws: model output is never
  trusted. Everything here asserts that malformed output raises, because
  specs/extraction.md wants a schema failure to be a failure. Two of these
  failures in a row is what sends a document to the fallback, so this raising
  behaviour is load bearing rather than defensive.
*/

const wellFormed = JSON.stringify({
  fields: FIELD_NAMES.map((name) => ({
    name,
    value: "x",
    confidence: 0.9,
    box: { x0: 0, y0: 0, x1: 1, y1: 1 },
  })),
});

describe("parseModelOutput", () => {
  it("parses well formed output", () => {
    expect(parseModelOutput(wellFormed).fields).toHaveLength(8);
  });

  /*
    Unwrapping a markdown fence is transport packaging, not data repair: the
    field values inside are never touched. Models wrap JSON in fences often
    enough that refusing would burn both attempts on a formatting habit.
  */
  it("unwraps a markdown code fence around otherwise valid output", () => {
    expect(parseModelOutput("```json\n" + wellFormed + "\n```").fields).toHaveLength(8);
  });

  it("unwraps a bare fence with no language tag", () => {
    expect(parseModelOutput("```\n" + wellFormed + "\n```").fields).toHaveLength(8);
  });

  it("raises on output that is not JSON at all", () => {
    expect(() => parseModelOutput("I could not read this invoice, sorry.")).toThrow(
      ExtractionParseError,
    );
  });

  it("raises on truncated JSON", () => {
    expect(() => parseModelOutput(wellFormed.slice(0, 60))).toThrow(ExtractionParseError);
  });

  it("raises on empty output", () => {
    expect(() => parseModelOutput("")).toThrow(ExtractionParseError);
  });

  it("raises on valid JSON that fails the schema", () => {
    const sevenFields = JSON.stringify({
      fields: FIELD_NAMES.slice(0, 7).map((name) => ({
        name,
        value: "x",
        confidence: 0.9,
        box: null,
      })),
    });

    expect(() => parseModelOutput(sevenFields)).toThrow(ExtractionParseError);
  });

  /*
    A model that renames a field is not following the contract, and
    specs/extraction.md says you want to know rather than quietly coerce.
  */
  it("raises rather than repairing an unknown field name", () => {
    const renamed = JSON.parse(wellFormed) as { fields: { name: string }[] };
    renamed.fields[0]!.name = "invoiceNumber";

    expect(() => parseModelOutput(JSON.stringify(renamed))).toThrow(ExtractionParseError);
  });

  it("carries the underlying reason so a failed extraction row can record it", () => {
    try {
      parseModelOutput("not json");
      expect.unreachable("should have raised");
    } catch (error) {
      expect(error).toBeInstanceOf(ExtractionParseError);
      expect((error as ExtractionParseError).message).toBeTruthy();
    }
  });
});
