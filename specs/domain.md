# Domain spec

These rules are the product. Implement them in `src/domain` as pure functions, tested without a database.

## Entities

| Entity | Purpose |
|---|---|
| `batch` | A set of documents uploaded together |
| `document` | One file. Carries the content hash and the blob URL. |
| `extraction` | One model attempt at a document. A document may have several over time. |
| `field` | One extracted value with confidence, bounding box, and status |
| `correction` | Append only record of a human changing a value |
| `reviewer` | A human, identified by handle. No password in version one. |

## Document states

```
received ──▶ extracting ──▶ ready ──▶ in_review ──▶ completed  (terminal)
                  │
                  └──▶ failed ──▶ (retry) ──▶ extracting
```

`failed` means both extraction attempts failed and the fallback also produced nothing usable. It is rare and it is visible, never silent.

## Field statuses

| Status | Meaning |
|---|---|
| `auto_accepted` | Confidence at or above the threshold. Not shown to the reviewer unless sampled. |
| `needs_review` | Below the threshold, or produced by the fallback. Blocks completion. |
| `sampled` | Auto accepted but drawn for verification. Blocks completion. |
| `confirmed` | A human looked at it and agreed |
| `corrected` | A human changed the value |

## Invariants

1. **Extraction never overwrites a human.** A re extraction writes a new `extraction` row and only populates fields whose status is `auto_accepted` or `needs_review`. Fields that are `confirmed` or `corrected` are left exactly as they are. This is the invariant that makes every accuracy number in the product meaningful. Test it directly.
2. **Every value change writes a correction row** in the same transaction as the field update. If the correction insert fails, the update rolls back. The correction carries the previous value, the new value, the actor, and the extraction id it disagreed with.
3. **A document cannot be completed** while any field is `needs_review` or `sampled`. Attempting it returns a validation error naming the outstanding fields.
4. **Content hash is unique.** The same file uploaded twice is one document. The second upload returns the existing document and says so.
5. **The threshold is stored on the extraction row** at the time of extraction. Tuning the threshold later must not retroactively change what counted as auto accepted, or accuracy history becomes fiction.
6. **Bounding boxes are normalised** to zero through one against page dimensions, so the interface does not care what resolution the document was uploaded at.

## Auto accept and sampling

```
confidence >= threshold  ▶ auto_accepted
                         ▶ then with probability p, promote to sampled
confidence <  threshold  ▶ needs_review
```

Defaults. Threshold 0.85, sample rate 0.1. Both live in `src/domain/thresholds.ts` as named constants, both are displayed in the interface, and neither is hardcoded anywhere else.

Sampling uses a seeded pseudorandom function of the field id, not `Math.random()`. Two consequences worth having. The same field is sampled deterministically across reloads, so a reviewer does not see a field appear and vanish. And the sampling is reproducible in tests.

## Accuracy

Three numbers, and they measure different things. Do not average them.

**Field accuracy**, per field name.

```
confirmed / (confirmed + corrected)
```

Over fields a human actually looked at, which means `needs_review` fields plus `sampled` fields. This is what the model gets right when it was asked.

**Auto accept precision.**

```
confirmed / (confirmed + corrected)   restricted to fields that were sampled
```

This is the number that matters. It answers whether the fields nobody checked were safe to not check. If it drops below roughly 0.97 the threshold is too low and the interface should say so plainly rather than leave it to be noticed.

**Time saved, in seconds.**

```
count(auto_accepted and never sampled) * MANUAL_SECONDS_PER_FIELD
```

`MANUAL_SECONDS_PER_FIELD` defaults to fifteen, lives beside the thresholds, and is rendered next to the result. Only fields a human never touched count, which is the strictest honest reading.

## Fallback extraction

When the model errors, times out at twenty seconds, or fails schema parse twice, run `src/extract/fallback.ts`. Pure functions, no network, regex based, covering the three field types with recognisable shapes.

* Dates in common formats, mapped to `issue_date` and `due_date` by proximity to keywords.
* Currency amounts, largest taken as `total`, second largest as `subtotal`.
* Invoice number patterns, alphanumeric runs near the words invoice or ref.

Everything the fallback produces gets confidence zero and status `needs_review`. It is not trying to be right. It is trying to give the reviewer a starting position rather than eight empty boxes, and to prove the system does not stop when the provider does.

Test this by running the suite with the API key unset. That is a CI job, not a manual check.
