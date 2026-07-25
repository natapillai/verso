# Extraction spec

The model is one component with a contract, a budget, and a replacement.

## The call

One call per document. The page image goes in as a base64 image block alongside the instruction. No OCR step, no chunking, no chain. If a document has multiple pages, send the first two and no more.

Model, the small fast one. Max output tokens capped. Timeout twenty seconds, two attempts, then the fallback.

## Output schema

```ts
const Extracted = z.object({
  fields: z.array(z.object({
    name: z.enum([
      "invoice_number", "issue_date", "due_date", "supplier_name",
      "supplier_tax_id", "currency", "subtotal", "total",
    ]),
    value: z.string().nullable(),
    confidence: z.number().min(0).max(1),
    box: z.object({
      x0: z.number().min(0).max(1), y0: z.number().min(0).max(1),
      x1: z.number().min(0).max(1), y1: z.number().min(0).max(1),
    }).nullable(),
  })).length(8),
});
```

Exactly eight entries, one per field name, in a fixed order. A missing field is a schema failure rather than something to fill in later, because a model that skips fields is a model that is not following the contract and you want to know.

`value` is nullable because the field genuinely may not be on the page. A null value with high confidence means the model is confident it is absent, which is useful and different from a null with low confidence.

`box` is nullable for the same reason. A null box on a non null value is allowed but should be rare, and it is worth logging when it happens.

## Prompt design

Three rules.

1. Ask for the box before the value in the output ordering. Locating first and reading second produces better values than reading first and locating afterwards, because the second ordering invites the model to justify a value it already guessed.
2. Instruct it to return null with high confidence when a field is genuinely absent, and low confidence when it cannot tell. Those are different states and collapsing them loses the signal the whole product runs on.
3. Give one worked example in the prompt, not five. A single example fixes the format. More of them narrow the model toward the example's layout.

Keep the prompt in `src/extract/prompt.ts` as one exported function. Version it with a `PROMPT_VERSION` constant stored on every `extraction` row, so accuracy before and after a prompt change can be compared rather than blurred together.

## Calibration

Confidence from a language model is not probability, and treating it as one is the standard mistake. The threshold of 0.85 is a starting guess, not a derived value.

The sampling described in `specs/domain.md` is what turns it into a measured one. After a few hundred sampled fields, auto accept precision tells you whether 0.85 was too generous. Say this in the README rather than pretending the number was principled.

## Cost and latency

Record `latency_ms`, `input_tokens`, and `output_tokens` on every `extraction` row. Cost per thousand documents then goes in the README as a measured figure. Images are the expensive part of the input, so downscale to a sensible width before sending and record what that width was.

## Evaluating it

Twenty labelled fixture documents in `src/extract/fixtures`, with a hand written expected value per field. `pnpm eval` runs extraction against them and prints per field accuracy and mean confidence.

This runs on demand rather than in CI, because it costs money and the fixture set is small. Production accuracy comes from reviewer corrections. The fixtures catch a regression before it reaches a reviewer. Both belong and they measure different things.
