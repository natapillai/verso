# Product spec

## The problem

A client sends a batch of invoices. Somebody opens each one and types eight fields into a system. It takes a couple of minutes a document, mistakes are invisible until a spot check finds them, and nobody can say which field people get wrong most often.

The waste is not the reading. It is the typing. A person is being used as a transcription device, and their actual value, judgment about the odd case, is spent on the ninety percent that is not odd.

## What Verso does

The model reads each document and fills the fields itself, with a confidence score and the region of the page each value came from. The reviewer confirms rather than types, and only the low confidence fields ask for their attention.

Every correction is recorded against the field name. Accuracy stops being a claim and becomes a number that updates as people work.

## Who uses it

| User | What they need |
|---|---|
| Reviewer | Clear a batch fast, trust what was filled in, correct what is wrong without hunting for it on the page |
| Operations lead | Know which fields the model is weak on, so training and staffing follow the data |
| Client | Evidence that accuracy is measured continuously rather than sampled quarterly |

The reviewer is the primary user. Every design decision favours them.

## The idea that makes it work

Confidence is per field, not per document. A document where seven fields are certain and one is doubtful should cost the reviewer one field of attention, not a full re read. So high confidence fields are accepted automatically and low confidence fields are the only ones that stop the reviewer.

That creates an obvious hole. If nobody ever checks the auto accepted fields, the accuracy number is measuring only the fields the model already knew it was unsure about, which is the easy half. So a random sample of auto accepted fields is shown for verification anyway. The sample rate is configurable and displayed next to the accuracy figure.

Without the sample the metric quietly flatters itself. This is the single most important design decision in the product and it is worth pointing at in review.

## Business value, stated plainly

Manual entry runs at roughly fifteen seconds a field. At eight fields that is two minutes a document. If the model fills seven of eight confidently, the reviewer's work drops to one field plus a glance, call it twenty seconds.

The dashboard reports the saving as auto accepted field count times the manual baseline in seconds, with the baseline shown beside it so the reader can disagree with the assumption rather than the arithmetic.

## In scope for version one

1. Upload one or more invoice images or PDFs as a batch, deduplicated by content hash.
2. Extract eight fields per document with a per field confidence and a normalised bounding box.
3. Auto accept fields above a threshold, flag the rest for review.
4. A split review screen with the document on the left, the fields on the right, and a tether drawn between a focused field and its region on the page.
5. Confirm and correct, keyboard first, with an append only correction log.
6. Random verification sampling of auto accepted fields.
7. An accuracy view showing per field accuracy, auto accept precision, and time saved.
8. A deterministic fallback extractor for when the model is unavailable.
9. Seeded demo documents so the deployed URL is never empty.

## The field set

`invoice_number`, `issue_date`, `due_date`, `supplier_name`, `supplier_tax_id`, `currency`, `subtotal`, `total`.

Eight scalar fields. No line items. Line items are a table extraction problem, they are three times the work, and they demonstrate nothing the eight fields do not.

## Deliberately out of scope

Authentication beyond a shared token, multi tenancy, a second document type, line items, exports, notifications, a client facing portal, internationalisation. Each is defensible later and none of them show anything the list above does not.

Hold this line under time pressure. A tight system that is correct reads better than a broad one that is shaky.

## Success criteria

1. A stranger opens the deployed URL and understands the product within thirty seconds without a walkthrough.
2. Clicking a field highlights exactly the right region of the document.
3. Correcting a field and reloading shows the correction, the original model value, and who changed it.
4. Removing the API key does not break upload. Documents still arrive and still reach a reviewer, with every field flagged for review.
5. Every number on the accuracy view traces to one query in `docs/architecture.md`.
