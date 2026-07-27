import { chromium } from "@playwright/test";

/*
  Renders an invoice to a PNG.

  The seed used to upload hand-rolled PDFs. They were small, they carried a text
  layer, and the review screen could not display a single one of them: the
  document panel puts the file in an <img>, and no browser renders a PDF that
  way. Twenty seeded documents meant twenty broken review screens, and the
  tether — the one element specs/design.md says to spend effort on — had nothing
  to draw against.

  So the seed sends images now. Laying an invoice out in HTML and photographing
  it in Chromium needs no new dependency, since Playwright is already here for
  the browser specs, and it produces a page that looks like a page rather than
  like something a script emitted. The model reads it as it would read a scan.

  PDFs are still accepted on upload and the panel now handles them; they are
  simply not what the demo corpus is made of.
*/

// A4 at 150dpi. Wide enough that the browser's downscale to 1600px is a real
// step rather than a no-op, which is the path worth exercising.
const WIDTH = 1240;
const HEIGHT = 1754;

function escape(value) {
  return String(value).replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
  );
}

/*
  Ambiguity, per specs/extraction.md's awkward cases. Not faint ink — faintness
  is a property of a rasterised page and says nothing to a model reading a clean
  render. What makes a page genuinely hard is two plausible answers: an
  unlabelled reference that could be the invoice number, a second date with no
  caption, and a "Balance due" that disagrees with "Total".
*/
function ambiguousBlocks(invoice) {
  return `
    <div class="muddle">
      <div class="ref">${escape(invoice.invoiceNumber)}</div>
      <div class="ref overstruck">${escape(invoice.invoiceNumber)}</div>
      <div class="loose">${escape(invoice.issueDate)}</div>
      <div class="loose">Ref ${escape(invoice.taxId.slice(0, -1))}</div>
    </div>`;
}

/* Stable per supplier, derived from the tax id so nothing is random per run. */
function sortCode(invoice) {
  const digits = invoice.taxId.replace(/\D/g, "").padEnd(6, "0");
  return `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4, 6)}`;
}

function accountNumber(invoice) {
  return invoice.taxId.replace(/\D/g, "").slice(-8).padStart(8, "0");
}

/*
  Two digits swapped in the pounds, not the pence — swapping the pence of an
  amount ending .00 changes nothing, which is how the first version of this
  quietly printed a "Balance due" identical to the total and posed no question
  at all.
*/
function transpose(amount) {
  const [whole, fraction] = amount.split(".");
  const swapped = whole.replace(/(\d)(\d)(?!.*\d)/, "$2$1");
  return fraction === undefined ? swapped : `${swapped}.${fraction}`;
}

function totalsRows(invoice) {
  const transposed = transpose(invoice.total);

  if (!invoice.ambiguous) {
    return `
      <tr><td>Subtotal</td><td>${escape(invoice.subtotal)}</td></tr>
      <tr><td>VAT 20%</td><td>${escape(invoice.vat)}</td></tr>
      <tr class="grand"><td>Total</td><td>${escape(invoice.total)}</td></tr>`;
  }

  // Three amounts, two of them called something that sounds final.
  return `
      <tr><td>Subtotal</td><td>${escape(invoice.subtotal)}</td></tr>
      <tr><td>VAT 20%</td><td>${escape(invoice.vat)}</td></tr>
      <tr class="grand"><td>Total</td><td>${escape(invoice.total)}</td></tr>
      <tr><td>Balance due</td><td>${escape(transposed)}</td></tr>`;
}

function html(invoice) {
  const omit = invoice.omit ?? [];
  const showTaxId = !omit.includes("supplier_tax_id");

  return `
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0; width: ${WIDTH}px; height: ${HEIGHT}px; background: #fff;
    font-family: Helvetica, Arial, sans-serif; color: #1a1a1a;
    font-size: 15px; line-height: 1.5; padding: 70px 80px;
  }
  .top { display: flex; justify-content: space-between; align-items: flex-start; }
  .supplier { font-size: 22px; font-weight: 700; letter-spacing: -0.01em; }
  .address { color: #555; margin-top: 6px; white-space: pre-line; }
  .taxid { color: #555; margin-top: 6px; }
  h1 {
    font-size: 34px; font-weight: 700; letter-spacing: 0.14em;
    margin: 0; text-transform: uppercase; color: #111;
  }
  .meta { margin-top: 18px; }
  .meta div { margin-top: 5px; display: flex; justify-content: flex-end; gap: 22px; }
  .meta .k { color: #666; }
  .billto { margin-top: 40px; }
  .billto .cap {
    font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #666;
  }
  .billto .who { margin-top: 7px; font-weight: 700; }
  .billto .where { color: #555; }
  .pay {
    margin-top: 52px; border: 1px solid #e2e2e2; background: #fafafa;
    padding: 18px 22px; width: 420px;
  }
  .pay .cap {
    font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #666;
    margin-bottom: 8px;
  }
  .pay div span { color: #666; display: inline-block; min-width: 120px; }
  .rule { border-top: 2px solid #111; margin: 44px 0 0; }
  table { width: 100%; border-collapse: collapse; margin-top: 26px; }
  th {
    text-align: left; font-size: 12px; letter-spacing: 0.08em;
    text-transform: uppercase; color: #666; border-bottom: 1px solid #ccc;
    padding-bottom: 8px;
  }
  td { padding: 14px 0; border-bottom: 1px solid #eee; }
  .num { text-align: right; }
  .totals { width: 300px; margin-left: auto; margin-top: 30px; }
  .totals td { border: 0; padding: 7px 0; }
  .totals td:last-child { text-align: right; }
  .totals .grand td {
    border-top: 1px solid #111; font-weight: 700; font-size: 18px; padding-top: 12px;
  }
  .foot { position: absolute; bottom: 70px; left: 80px; right: 80px;
    color: #777; font-size: 12px; border-top: 1px solid #eee; padding-top: 14px; }
  .muddle { margin-top: 30px; position: relative; height: 58px; color: #333; }
  .ref { position: absolute; top: 0; left: 0; font-size: 15px; letter-spacing: 0.03em; }
  /* Struck at identical coordinates, so the reference reads as two overlapping
     impressions rather than one clean value. */
  .overstruck { transform: translate(1px, 1px); opacity: 0.85; }
  .loose { position: absolute; left: 260px; color: #444; }
  .loose:last-child { left: 470px; }
</style>

<div class="top">
  <div>
    <div class="supplier">${escape(invoice.supplier)}</div>
    <div class="address">${escape(invoice.address)}</div>
    ${showTaxId ? `<div class="taxid">VAT no. ${escape(invoice.taxId)}</div>` : ""}
  </div>
  <div>
    <h1>Invoice</h1>
    <div class="meta">
      ${
        invoice.ambiguous
          ? ""
          : `<div><span class="k">Invoice number</span>${escape(invoice.invoiceNumber)}</div>
             <div><span class="k">Issue date</span>${escape(invoice.issueDate)}</div>`
      }
      <div><span class="k">Due</span>${escape(invoice.dueDate)}</div>
      <div><span class="k">Currency</span>${escape(invoice.currency)}</div>
    </div>
  </div>
</div>

${invoice.ambiguous ? ambiguousBlocks(invoice) : ""}

<div class="billto">
  <div class="cap">Bill to</div>
  <div class="who">Globalco Operations Ltd</div>
  <div class="where">4 Pilgrim Street, London EC4V 6RN</div>
</div>

<div class="rule"></div>

<table>
  <tr><th>Description</th><th class="num">Amount</th></tr>
  <tr><td>${escape(invoice.lineItem)}</td><td class="num">${escape(invoice.subtotal)}</td></tr>
</table>

<table class="totals">${totalsRows(invoice)}</table>

<!--
  A bank block, because a real invoice has one. It also puts a second run of
  digits on the page a short way from the VAT number, which is the kind of
  neighbour that makes reading supplier_tax_id a real task rather than the only
  long number present.
-->
<div class="pay">
  <div class="cap">Payment details</div>
  <div><span>Account name</span>${escape(invoice.supplier)}</div>
  <div><span>Sort code</span>${sortCode(invoice)}</div>
  <div><span>Account number</span>${accountNumber(invoice)}</div>
</div>

<div class="foot">
  Payment within 30 days of the issue date. Late payment interest is charged at
  8% above base rate. ${escape(invoice.supplier)} is registered in England.
</div>`;
}

/**
 * Render every invoice to PNG bytes, in one browser.
 *
 * Returns an array of Buffers in the order given. One browser for twenty pages,
 * because launching Chromium is by far the slowest part.
 */
export async function renderInvoices(invoices) {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: WIDTH, height: HEIGHT },
      deviceScaleFactor: 1,
    });

    const images = [];
    for (const invoice of invoices) {
      await page.setContent(html(invoice), { waitUntil: "load" });
      images.push(await page.screenshot({ type: "png" }));
    }

    return images;
  } finally {
    await browser.close();
  }
}
