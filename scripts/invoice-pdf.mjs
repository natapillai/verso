/*
  A minimal invoice as a PDF, built by hand.

  Why hand rolled rather than a library: a PDF using one of the fourteen standard
  fonts needs no font embedding, so the whole file is a few hundred bytes of
  ASCII and an xref table. That buys three things a rasterised image would not.
  No dependency and no font rasteriser. About 2KB per document, so twenty of them
  are generated at seed time and none of them live in the repository. And a real
  text layer — which is the first thing the regex fallback in src/extract has ever
  had to work on, because an image with no OCR step gives it nothing.
*/

const FONT_REGULAR = "F1"; // Helvetica
const FONT_BOLD = "F2"; // Helvetica-Bold

/** US Letter at 72dpi, which is what PDF user space defaults to. */
const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;

/**
 * Escapes the three characters that would otherwise terminate or nest a PDF
 * string literal.
 */
function pdfString(text) {
  return String(text).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

/**
 * One line of text.
 *
 * `grey` is how the hard-to-read documents are made: pale ink at a small size is
 * a genuine legibility problem rather than a cosmetic one, so the model should
 * come back less certain and the field should land in needs_review.
 */
function text({ x, y, size = 11, bold = false, grey = 0, value }) {
  const font = bold ? FONT_BOLD : FONT_REGULAR;
  const tone = grey > 0 ? `${grey} ${grey} ${grey} rg\n` : "0 0 0 rg\n";
  return `BT\n${tone}/${font} ${size} Tf\n1 0 0 1 ${x} ${PAGE_HEIGHT - y} Tm\n(${pdfString(value)}) Tj\nET\n`;
}

/**
 * Assembles the object table and the xref.
 *
 * Byte offsets in the xref must be exact, so the body is built first and each
 * object's start position recorded as it goes.
 */
function buildPdf(contentStream) {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
      `/Resources << /Font << /${FONT_REGULAR} 5 0 R /${FONT_BOLD} 6 0 R >> >> /Contents 4 0 R >>`,
    `<< /Length ${Buffer.byteLength(contentStream, "latin1")} >>\nstream\n${contentStream}endstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
  ];

  let body = "%PDF-1.4\n";
  const offsets = [];

  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(body, "latin1"));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefStart = Buffer.byteLength(body, "latin1");
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    xref += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }

  const trailer =
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;

  return Buffer.from(body + xref + trailer, "latin1");
}

/**
 * An invoice.
 *
 * `omit` drops a field from the page entirely. That is not the same as leaving it
 * blank: the field is genuinely absent, which is the case specs/extraction.md
 * wrote the prompt for — a null value with high confidence means the model is
 * sure it is not there, and that is a different answer from one it could not read.
 *
 * `ambiguous` is what actually makes a document hard for the model, and the
 * distinction cost me a seeding run to learn. Pale ink at a small size makes a
 * page hard for a *human* and does nothing to a model reading a PDF, because the
 * text layer is exact no matter how faint the rendering. What produces genuine
 * uncertainty is an ambiguous document: unlabelled dates, two candidate totals,
 * a reference that might or might not be the invoice number. `faint` is kept
 * because such documents really are poorly printed, but it is cosmetic — the
 * ambiguity is what moves confidence.
 */
export function invoicePdf({
  supplier,
  address,
  taxId,
  invoiceNumber,
  issueDate,
  dueDate,
  currency,
  subtotal,
  vat,
  total,
  lineItem,
  faint = false,
  ambiguous = false,
  omit = [],
}) {
  const grey = faint ? 0.55 : 0;
  const body = faint ? 9 : 11;
  const heading = faint ? 16 : 26;

  if (ambiguous) {
    return buildPdf(
      ambiguousLayout({
        supplier,
        address,
        taxId,
        invoiceNumber,
        issueDate,
        dueDate,
        subtotal,
        total,
        lineItem,
        grey,
        body,
        heading,
      }),
    );
  }

  const shows = (field) => !omit.includes(field);
  let content = "";

  content += text({ x: 56, y: 72, size: heading, bold: true, grey, value: "INVOICE" });

  content += text({ x: 56, y: 118, size: body + 2, bold: true, grey, value: supplier });
  content += text({ x: 56, y: 136, size: body, grey, value: address });
  if (shows("supplier_tax_id")) {
    content += text({ x: 56, y: 154, size: body, grey, value: `VAT No: ${taxId}` });
  }

  content += text({ x: 56, y: 206, size: body, grey, value: `Invoice No: ${invoiceNumber}` });
  content += text({ x: 56, y: 224, size: body, grey, value: `Invoice date: ${issueDate}` });
  content += text({ x: 56, y: 242, size: body, grey, value: `Payment due: ${dueDate}` });

  content += text({ x: 56, y: 300, size: body, grey, value: lineItem });
  content += text({ x: 430, y: 300, size: body, grey, value: subtotal });

  content += text({ x: 360, y: 360, size: body, grey, value: "Subtotal" });
  content += text({ x: 430, y: 360, size: body, grey, value: subtotal });
  content += text({ x: 360, y: 378, size: body, grey, value: "VAT" });
  content += text({ x: 430, y: 378, size: body, grey, value: vat });
  content += text({ x: 360, y: 402, size: body + 2, bold: true, grey, value: "Total" });
  content += text({
    x: 430,
    y: 402,
    size: body + 2,
    bold: true,
    grey,
    value: `${currency} ${total}`,
  });

  return buildPdf(content);
}

/**
 * A genuinely awkward page.
 *
 * Everything the eight fields need is present, but nothing announces itself:
 * two bare dates with no labels, two competing amounts, a reference code that
 * may or may not be the invoice number, and a bare number that could be a VAT
 * registration or an account number. A careful reader can work it out. A model
 * should be less than certain, which is the point — these documents exist so the
 * reviewer queue has something in it and field accuracy has a denominator.
 */
function ambiguousLayout({
  supplier,
  address,
  taxId,
  invoiceNumber,
  issueDate,
  dueDate,
  subtotal,
  total,
  lineItem,
  grey,
  body,
  heading,
}) {
  let content = "";
  const digits = invoiceNumber.replace(/\D/g, "");
  const stem = invoiceNumber.split("-")[0] ?? "REF";
  /** Digits transposed, the way a smudged or double-struck page reads. */
  const transposed = `${digits.slice(0, 1)}${digits.slice(2, 3)}${digits.slice(1, 2)}${digits.slice(3)}`;

  content += text({ x: 56, y: 70, size: heading, bold: true, grey, value: supplier });
  content += text({ x: 56, y: 92, size: body, grey, value: address });

  // A registration number one digit short of a valid one, beside an account
  // number. Neither is labelled as the tax id.
  content += text({ x: 56, y: 128, size: body, grey, value: taxId.slice(0, -1) });
  content += text({ x: 200, y: 128, size: body, grey, value: "Acc 88213" });

  /*
    The same reference struck twice at the same coordinates. A PDF text layer
    keeps both, so what a reader gets back is genuinely garbled rather than
    merely unlabelled — which is the difference between a page that is awkward
    and a page a model should be unsure about.
  */
  content += text({ x: 56, y: 170, size: body, grey, value: `Ref ${stem}-${digits}` });
  content += text({ x: 56, y: 170, size: body, grey, value: `Ref ${stem}-${transposed}` });

  // Bare dates, one with the year cut off by the page edge.
  content += text({ x: 56, y: 196, size: body, grey, value: `Date  ${issueDate.slice(0, -2)}` });
  content += text({ x: 200, y: 196, size: body, grey, value: `Date  ${dueDate}` });

  content += text({ x: 56, y: 250, size: body, grey, value: lineItem });

  // Amounts that do not reconcile: two totals differing by a transposition.
  const swapped = total.replace(/(\d),(\d)(\d)(\d)/, "$1,$3$2$4");
  content += text({ x: 330, y: 320, size: body, grey, value: "Total" });
  content += text({ x: 430, y: 320, size: body, grey, value: subtotal });
  content += text({ x: 330, y: 344, size: body, grey, value: "Total" });
  content += text({ x: 430, y: 344, size: body, grey, value: total });
  content += text({ x: 330, y: 368, size: body, grey, value: "Balance due" });
  content += text({ x: 430, y: 368, size: body, grey, value: swapped });

  return content;
}
