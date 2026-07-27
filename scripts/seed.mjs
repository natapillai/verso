/*
  Seeds a deployment with twenty reviewed invoices.

    pnpm seed                          against localhost
    pnpm seed -- --url https://…       against a deployment

  It drives the product's own HTTP surface — upload, extract, confirm, correct,
  complete — rather than writing rows. Two things follow. The demo data is real
  model output that went through the real review path, not fixtures dressed up to
  look like it. And every correction it makes is a genuine correction row written
  in the same transaction as its field update, so the accuracy view is reading
  exactly what it would read in production.

  Pure HTTP also means no database credentials: it can point at any deployment.

  specs/product.md wants the deployed URL never empty. This is that.
*/

import { renderInvoices } from "./invoice-image.mjs";
import { INVOICES } from "./invoices.mjs";

const url = argValue("--url") ?? "http://localhost:3000";

/*
  Which documents get how far. Chosen so the demo shows a queue in motion rather
  than a finished pile: some done, some mid review, some untouched. The untouched
  ones are also what makes time saved non-zero, since only fields nobody has
  touched count toward it.
*/
const COMPLETED_THROUGH = 8; // documents 1..8 fully reviewed and completed
const PARTIAL_THROUGH = 14; // documents 9..14 partly reviewed, left open

/*
  Three batches rather than twenty.

  A batch is one upload request, so uploading the invoices one at a time made
  twenty batches of one document — which left the review header reading
  "Batch 52 · 0 of 1 done" on every screen, and the queue repeating a batch
  number that told a reader nothing. specs/design.md puts batch progress in the
  header because it is meant to mean something.

  The boundaries line up with how far review got, so the queue reads as a place
  of work: one intake cleared, one part way through, one not started.
*/
const BATCHES = [
  { label: "March intake", through: COMPLETED_THROUGH },
  { label: "April intake", through: PARTIAL_THROUGH },
  { label: "May intake", through: Infinity },
];

/** Deliberate disagreements, by document index and field name. */
const CORRECTIONS = new Map([
  [1, { name: "supplier_tax_id", value: "GB417820395" }],
  [3, { name: "total", value: "812.40" }],
  [5, { name: "supplier_name", value: "Harbour Logistics Limited" }],
  [9, { name: "due_date", value: "2025-10-17" }],
  [12, { name: "invoice_number", value: "KB-1177-A" }],
]);

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function send(path, init) {
  const response = await fetch(`${url}${path}`, init);
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { ok: response.ok, status: response.status, body };
}

/** One request carrying every invoice in a batch, which is what makes it a batch. */
async function uploadBatch(invoices, label, images) {
  const form = new FormData();
  form.append("label", label);

  for (const [index, invoice] of invoices.entries()) {
    const name = `${invoice.invoiceNumber.toLowerCase()}.png`;
    form.append("file", new File([images[index]], name, { type: "image/png" }));
  }

  const result = await send("/api/upload", { method: "POST", body: form });
  if (!result.ok) throw new Error(`upload ${label}: ${JSON.stringify(result.body)}`);

  return result.body.documents.map((document) => ({
    id: document.id,
    duplicate: document.duplicate,
    filename: document.filename,
  }));
}

async function extract(documentId) {
  const result = await send(`/api/documents/${documentId}/extract`, { method: "POST" });
  if (!result.ok) throw new Error(`extract: ${JSON.stringify(result.body)}`);
  return result.body;
}

async function fieldsOf(documentId) {
  const result = await send(`/api/documents/${documentId}/fields`);
  if (!result.ok) throw new Error(`fields: ${JSON.stringify(result.body)}`);
  return result.body.fields;
}

const confirm = (fieldId) =>
  send(`/api/fields/${fieldId}/confirm`, { method: "POST" });

const correct = (fieldId, value) =>
  send(`/api/fields/${fieldId}/correct`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ value }),
  });

const complete = (documentId) =>
  send(`/api/documents/${documentId}/complete`, { method: "POST" });

/** Fields a reviewer would be stopped by. */
const outstanding = (field) =>
  field.status === "needs_review" || field.status === "sampled";

async function review(documentId, position) {
  const fields = await fieldsOf(documentId);
  const planned = CORRECTIONS.get(position);
  let corrected = 0;
  let confirmed = 0;

  if (planned) {
    const target = fields.find((f) => f.name === planned.name);
    if (target && target.value !== planned.value) {
      const result = await correct(target.id, planned.value);
      if (result.ok) corrected += 1;
    }
  }

  const settle = position <= COMPLETED_THROUGH ? fields : fields.filter(outstanding).slice(0, 2);

  for (const field of settle) {
    if (planned && field.name === planned.name) continue;
    if (field.status === "confirmed" || field.status === "corrected") continue;
    const result = await confirm(field.id);
    if (result.ok) confirmed += 1;
  }

  let completed = false;
  if (position <= COMPLETED_THROUGH) {
    const result = await complete(documentId);
    completed = result.ok;
  }

  return { confirmed, corrected, completed };
}

async function main() {
  console.log(`Seeding ${url}`);
  console.log(`${INVOICES.length} invoices\n`);

  // One browser for all twenty pages; launching Chromium is the slow part.
  console.log("Rendering the pages");
  const rendered = await renderInvoices(INVOICES);

  const documents = [];
  let from = 0;

  for (const batch of BATCHES) {
    const slice = INVOICES.slice(from, Math.min(batch.through, INVOICES.length));
    if (slice.length === 0) continue;

    console.log(`${batch.label}, ${slice.length} invoices`);
    const uploaded = await uploadBatch(
      slice,
      batch.label,
      rendered.slice(from, from + slice.length),
    );

    for (const [offset, invoice] of slice.entries()) {
      const position = from + offset + 1;
      const document = uploaded[offset];

      if (document.duplicate) {
        console.log(`${String(position).padStart(2)}. ${document.filename} already there`);
        documents.push({ ...document, position });
        continue;
      }

      const result = await extract(document.id);
      const note = invoice.ambiguous
        ? " (hard to read)"
        : invoice.omit
          ? " (missing a field)"
          : "";
      console.log(
        `${String(position).padStart(2)}. ${document.filename} extracted by ${result.source}${note}`,
      );
      documents.push({ ...document, position });
    }

    from += slice.length;
  }

  console.log("");

  let totalConfirmed = 0;
  let totalCorrected = 0;
  let totalCompleted = 0;

  for (const document of documents) {
    if (document.position > PARTIAL_THROUGH) continue;
    const result = await review(document.id, document.position);
    totalConfirmed += result.confirmed;
    totalCorrected += result.corrected;
    if (result.completed) totalCompleted += 1;
  }

  console.log(`Reviewed: ${totalConfirmed} confirmed, ${totalCorrected} corrected`);
  console.log(`Completed: ${totalCompleted} documents`);
  console.log(`Untouched: ${documents.length - PARTIAL_THROUGH} documents\n`);
  console.log(`Open ${url}/accuracy to see what that adds up to.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
