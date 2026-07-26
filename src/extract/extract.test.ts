import { describe, expect, it, vi } from "vitest";
import { FIELD_NAMES } from "@/domain/fields";
import { MAX_ATTEMPTS, extractDocument, type ModelTransport } from "./extract";

/*
  The policy from specs/extraction.md and specs/domain.md: two attempts, twenty
  seconds each, then the fallback. Nothing here touches the network — the
  transport is injected — so these run in the `degraded` CI job alongside
  everything else.
*/

const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52,
  0, 0, 6, 64, 0, 0, 0, 100,
]); // width 1600

const goodOutput = JSON.stringify({
  fields: FIELD_NAMES.map((name) => ({
    name,
    value: `v-${name}`,
    confidence: 0.9,
    box: null,
  })),
});

function transportReturning(text: string): ModelTransport {
  return vi.fn(async () => ({
    text,
    model: "claude-haiku-4-5",
    inputTokens: 1200,
    outputTokens: 300,
  }));
}

const baseArgs = { bytes: PNG, mimeType: "image/png", fallbackText: "" };

describe("extractDocument on the happy path", () => {
  it("returns the model's fields after one attempt", async () => {
    const transport = transportReturning(goodOutput);
    const result = await extractDocument({ ...baseArgs, transport });

    expect(result.source).toBe("model");
    expect(result.attempt).toBe(1);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(result.fields.map((f) => f.value)).toContain("v-total");
  });

  it("records the cost and latency figures the README quotes", async () => {
    const result = await extractDocument({
      ...baseArgs,
      transport: transportReturning(goodOutput),
    });

    expect(result.inputTokens).toBe(1200);
    expect(result.outputTokens).toBe(300);
    expect(result.model).toBe("claude-haiku-4-5");
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.promptVersion).toBeTruthy();
  });

  it("records the width of the image it actually sent", async () => {
    const result = await extractDocument({
      ...baseArgs,
      transport: transportReturning(goodOutput),
    });

    expect(result.imageWidth).toBe(1600);
  });
});

describe("extractDocument retry policy", () => {
  it("retries once when the first attempt fails schema parse, then succeeds", async () => {
    const transport = vi
      .fn<ModelTransport>()
      .mockResolvedValueOnce({
        text: "not json",
        model: "claude-haiku-4-5",
        inputTokens: 1,
        outputTokens: 1,
      })
      .mockResolvedValueOnce({
        text: goodOutput,
        model: "claude-haiku-4-5",
        inputTokens: 1,
        outputTokens: 1,
      });

    const result = await extractDocument({ ...baseArgs, transport });

    expect(transport).toHaveBeenCalledTimes(2);
    expect(result.source).toBe("model");
    expect(result.attempt).toBe(2);
  });

  /*
    "fails schema parse twice" is the exact trigger in specs/domain.md. A third
    attempt would spend money the budget does not have; stopping at one would
    throw away a recoverable formatting blip.
  */
  it("falls back after exactly two failed parses, never a third attempt", async () => {
    const transport = transportReturning("still not json");
    const result = await extractDocument({ ...baseArgs, transport });

    expect(transport).toHaveBeenCalledTimes(MAX_ATTEMPTS);
    expect(MAX_ATTEMPTS).toBe(2);
    expect(result.source).toBe("fallback");
  });

  it("falls back when the transport errors both times", async () => {
    const transport = vi.fn<ModelTransport>().mockRejectedValue(new Error("503"));
    const result = await extractDocument({ ...baseArgs, transport });

    expect(transport).toHaveBeenCalledTimes(2);
    expect(result.source).toBe("fallback");
    expect(result.error).toContain("503");
  });

  it("falls back when the transport times out", async () => {
    const transport = vi
      .fn<ModelTransport>()
      .mockRejectedValue(new Error("Request timed out after 20000ms"));

    const result = await extractDocument({ ...baseArgs, transport });
    expect(result.source).toBe("fallback");
  });
});

describe("extractDocument with the model unavailable", () => {
  /*
    Success criterion 4 in specs/product.md: removing the API key does not break
    the product. Documents still reach a reviewer with every field flagged. This
    is the assertion the `degraded` CI job exists to keep honest.
  */
  it("goes straight to the fallback with no transport, spending nothing", async () => {
    const transport = transportReturning(goodOutput);
    const result = await extractDocument({
      ...baseArgs,
      transport,
      modelAvailable: false,
    });

    expect(transport).not.toHaveBeenCalled();
    expect(result.source).toBe("fallback");
    expect(result.attempt).toBe(0);
    expect(result.model).toBeNull();
  });

  it("still returns all eight fields so the reviewer gets a full form", async () => {
    const result = await extractDocument({ ...baseArgs, modelAvailable: false });

    expect(result.fields).toHaveLength(8);
    expect(result.fields.map((f) => f.name)).toEqual([...FIELD_NAMES]);
  });

  it("flags every fallback field for review by giving it confidence zero", async () => {
    const result = await extractDocument({
      ...baseArgs,
      modelAvailable: false,
      fallbackText: "Invoice INV-1 Total 10.00",
    });

    expect(result.fields.every((f) => f.confidence === 0)).toBe(true);
  });

  it("still recovers what the fallback can read from any text it was given", async () => {
    const result = await extractDocument({
      ...baseArgs,
      modelAvailable: false,
      fallbackText: "Invoice No: INV-2024-0817\nTotal 1,463.20",
    });

    const byName = new Map(result.fields.map((f) => [f.name, f.value]));
    expect(byName.get("invoice_number")).toBe("INV-2024-0817");
    expect(byName.get("total")).toBe("1463.20");
  });
});
