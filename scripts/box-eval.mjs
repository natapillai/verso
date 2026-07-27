import { chromium } from "@playwright/test";
import { invoiceHtml, renderInvoices } from "./invoice-image.mjs";
import { INVOICES } from "./invoices.mjs";

/*
  Measures how well the model locates a value on the page.

    pnpm eval:boxes                     against localhost
    pnpm eval:boxes -- --count 8        more pages
    pnpm eval:boxes -- --url https://…  against a deployment

  `specs/extraction.md` asks for a harness that runs a candidate prompt against
  labelled fixtures so a prompt change is measured rather than guessed. This is
  the part of it that could be built honestly: the pages are generated here, so
  every printed value's true position is known exactly, which makes the box the
  one thing in this product with ground truth. Values and confidences still have
  no labelled answer — that would need a hand-labelled corpus, and it is still
  the largest gap in the repository.

  It exists because the boxes were wrong in a way nobody would have caught by
  reading JSON. Every one came back the same size, stepping down the page at a
  regular interval, copied from the shape of the single worked example in the
  prompt. On screen that put the region outline in blank paper below the value.

  Two numbers per field:

    hit   does the middle of the predicted box land inside the real one? This is
          the question the reviewer actually asks — is the highlight on the thing.
    IoU   overlap over union, which says whether it is also the right size.
*/

const url = argValue("--url") ?? "http://localhost:3000";
const count = Number(argValue("--count") ?? 5);
const run = Date.now().toString(36);

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

/** Unique per run, so the content hash differs and invariant 4 does not dedup. */
function stamped(invoice) {
  return { ...invoice, lineItem: `${invoice.lineItem} · ${run}` };
}

/** Where every printed value really is, straight from the page that made it. */
async function groundTruth(invoices) {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1240, height: 1754 } });
    const truths = [];

    for (const invoice of invoices) {
      await page.setContent(invoiceHtml(invoice), { waitUntil: "load" });
      truths.push(
        await page.evaluate(() => {
          const boxes = {};
          for (const el of document.querySelectorAll(".v[data-field]")) {
            const r = el.getBoundingClientRect();
            boxes[el.dataset.field] = {
              x0: r.left / 1240,
              y0: r.top / 1754,
              x1: r.right / 1240,
              y1: r.bottom / 1754,
            };
          }
          return boxes;
        }),
      );
    }

    return truths;
  } finally {
    await browser.close();
  }
}

function intersectionOverUnion(a, b) {
  const w = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0));
  const h = Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
  const overlap = w * h;
  const union =
    (a.x1 - a.x0) * (a.y1 - a.y0) + (b.x1 - b.x0) * (b.y1 - b.y0) - overlap;
  return union <= 0 ? 0 : overlap / union;
}

function centreInside(predicted, truth) {
  const cx = (predicted.x0 + predicted.x1) / 2;
  const cy = (predicted.y0 + predicted.y1) / 2;
  return cx >= truth.x0 && cx <= truth.x1 && cy >= truth.y0 && cy <= truth.y1;
}

async function send(path, init) {
  const response = await fetch(`${url}${path}`, init);
  const text = await response.text();
  try {
    return { ok: response.ok, body: JSON.parse(text) };
  } catch {
    return { ok: response.ok, body: text };
  }
}

async function main() {
  const chosen = INVOICES.slice(0, count).map(stamped);
  console.log(`Box accuracy against ${url}`);
  console.log(`${chosen.length} pages, run ${run}\n`);

  const [images, truths] = await Promise.all([
    renderInvoices(chosen),
    groundTruth(chosen),
  ]);

  const perField = new Map();
  let hits = 0;
  let placed = 0;
  let missing = 0;

  for (const [index, invoice] of chosen.entries()) {
    const form = new FormData();
    form.append("label", `box eval ${run}`);
    form.append(
      "file",
      new File([images[index]], `eval-${run}-${index}.png`, { type: "image/png" }),
    );

    const uploaded = await send("/api/upload", { method: "POST", body: form });
    if (!uploaded.ok) throw new Error(`upload: ${JSON.stringify(uploaded.body)}`);

    const document = uploaded.body.documents[0];
    await send(`/api/documents/${document.id}/extract`, { method: "POST" });
    const fields = (await send(`/api/documents/${document.id}/fields`)).body.fields;

    for (const field of fields) {
      const truth = truths[index][field.name];
      if (!truth) continue;

      const stat = perField.get(field.name) ?? { hit: 0, iou: 0, n: 0, null: 0 };
      stat.n += 1;

      if (!field.box) {
        stat.null += 1;
        missing += 1;
      } else {
        placed += 1;
        const iou = intersectionOverUnion(field.box, truth);
        const hit = centreInside(field.box, truth);
        stat.iou += iou;
        if (hit) {
          stat.hit += 1;
          hits += 1;
        }
      }

      perField.set(field.name, stat);
    }

    console.log(`  ${invoice.invoiceNumber} read`);
  }

  console.log("\nfield              hit rate   mean IoU   no box");
  for (const [name, s] of [...perField].sort()) {
    const located = s.n - s.null;
    const hitRate = located ? `${Math.round((s.hit / located) * 100)}%` : "—";
    const iou = located ? (s.iou / located).toFixed(2) : "—";
    console.log(
      `  ${name.padEnd(17)} ${hitRate.padStart(6)}     ${String(iou).padStart(5)}      ${s.null}`,
    );
  }

  const total = hits + (placed - hits);
  console.log(
    `\n  overall          ${total ? Math.round((hits / total) * 100) : 0}% of placed boxes land on the value` +
      `, ${missing} left unplaced`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
