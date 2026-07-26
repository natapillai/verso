import { describe, expect, it } from "vitest";
import { FIELD_NAMES } from "@/domain/fields";
import { fallbackExtract } from "./fallback";

/*
  specs/domain.md: when the model errors, times out, or fails schema parse twice,
  this runs. Pure functions, no network, regex over the three field types with
  recognisable shapes.

  It is not trying to be right. It is trying to give the reviewer a starting
  position rather than eight empty boxes, and to prove the system does not stop
  when the provider does. Everything it produces is confidence zero and lands in
  needs_review, so nothing it guesses can ever be auto accepted.
*/

const INVOICE = `
  ACME SUPPLIES LTD
  Invoice No: INV-2024-0817
  Invoice date: 17 Aug 2024
  Payment due: 16 Sep 2024

  Subtotal      1,240.00
  VAT 18%         223.20
  Total         1,463.20
`;

function valueOf(fields: ReturnType<typeof fallbackExtract>, name: string) {
  return fields.find((f) => f.name === name)?.value ?? null;
}

describe("fallbackExtract shape", () => {
  it("always returns all eight fields, in the fixed order", () => {
    expect(fallbackExtract(INVOICE).map((f) => f.name)).toEqual([...FIELD_NAMES]);
  });

  /*
    The single most important property here. A fallback guess that could be auto
    accepted would corrupt the accuracy numbers with values no model produced and
    no human checked.
  */
  it("stamps everything with confidence zero", () => {
    expect(fallbackExtract(INVOICE).every((f) => f.confidence === 0)).toBe(true);
  });

  it("never produces a bounding box, because it never located anything", () => {
    expect(fallbackExtract(INVOICE).every((f) => f.box === null)).toBe(true);
  });

  it("returns eight null values for empty input rather than throwing", () => {
    const fields = fallbackExtract("");
    expect(fields).toHaveLength(8);
    expect(fields.every((f) => f.value === null)).toBe(true);
  });

  it("survives text with no invoice shapes in it at all", () => {
    const fields = fallbackExtract("the quick brown fox jumps over the lazy dog");
    expect(fields.every((f) => f.value === null)).toBe(true);
  });
});

describe("currency amounts", () => {
  it("takes the largest amount as total and the second largest as subtotal", () => {
    const fields = fallbackExtract(INVOICE);
    expect(valueOf(fields, "total")).toBe("1463.20");
    expect(valueOf(fields, "subtotal")).toBe("1240.00");
  });

  it("handles amounts without thousands separators", () => {
    const fields = fallbackExtract("Subtotal 90.00 Total 108.00");
    expect(valueOf(fields, "total")).toBe("108.00");
    expect(valueOf(fields, "subtotal")).toBe("90.00");
  });

  it("leaves subtotal null when only one amount is present", () => {
    const fields = fallbackExtract("Amount payable 42.00");
    expect(valueOf(fields, "total")).toBe("42.00");
    expect(valueOf(fields, "subtotal")).toBeNull();
  });

  it("leaves both null when no amount is present", () => {
    const fields = fallbackExtract("no numbers with decimals here");
    expect(valueOf(fields, "total")).toBeNull();
    expect(valueOf(fields, "subtotal")).toBeNull();
  });

  it("reads a currency symbol", () => {
    expect(valueOf(fallbackExtract("Total £1,463.20"), "currency")).toBe("GBP");
    expect(valueOf(fallbackExtract("Total $99.00"), "currency")).toBe("USD");
    expect(valueOf(fallbackExtract("Total €99.00"), "currency")).toBe("EUR");
  });

  it("reads an ISO currency code", () => {
    expect(valueOf(fallbackExtract("Total 99.00 USD"), "currency")).toBe("USD");
  });

  it("leaves currency null when nothing indicates one", () => {
    expect(valueOf(fallbackExtract("Total 99.00"), "currency")).toBeNull();
  });
});

describe("dates", () => {
  it("maps a date near the word due to due_date", () => {
    const fields = fallbackExtract(INVOICE);
    expect(valueOf(fields, "due_date")).toBe("2024-09-16");
  });

  it("maps a date near an issue keyword to issue_date", () => {
    const fields = fallbackExtract(INVOICE);
    expect(valueOf(fields, "issue_date")).toBe("2024-08-17");
  });

  it("reads ISO dates", () => {
    const fields = fallbackExtract("Invoice date: 2024-08-17  Due: 2024-09-16");
    expect(valueOf(fields, "issue_date")).toBe("2024-08-17");
    expect(valueOf(fields, "due_date")).toBe("2024-09-16");
  });

  it("reads slash separated day first dates", () => {
    const fields = fallbackExtract("Invoice date 17/08/2024, due 16/09/2024");
    expect(valueOf(fields, "issue_date")).toBe("2024-08-17");
    expect(valueOf(fields, "due_date")).toBe("2024-09-16");
  });

  it("reads month name first dates", () => {
    const fields = fallbackExtract("Issued Aug 17, 2024");
    expect(valueOf(fields, "issue_date")).toBe("2024-08-17");
  });

  it("uses a lone date as the issue date when no keyword places it", () => {
    const fields = fallbackExtract("2024-08-17");
    expect(valueOf(fields, "issue_date")).toBe("2024-08-17");
    expect(valueOf(fields, "due_date")).toBeNull();
  });

  it("does not use the same date for both issue and due", () => {
    const fields = fallbackExtract("Due 2024-09-16");
    expect(valueOf(fields, "due_date")).toBe("2024-09-16");
    expect(valueOf(fields, "issue_date")).toBeNull();
  });

  it("leaves both null when there is no date", () => {
    const fields = fallbackExtract("Invoice INV-1 total 10.00");
    expect(valueOf(fields, "issue_date")).toBeNull();
    expect(valueOf(fields, "due_date")).toBeNull();
  });
});

describe("invoice number", () => {
  it("finds an alphanumeric run after the word invoice", () => {
    expect(valueOf(fallbackExtract(INVOICE), "invoice_number")).toBe("INV-2024-0817");
  });

  it("finds one after the word ref", () => {
    expect(valueOf(fallbackExtract("Ref: ABC-123"), "invoice_number")).toBe("ABC-123");
  });

  it("finds one when the label and value are separated by a hash", () => {
    expect(valueOf(fallbackExtract("Invoice # 90210"), "invoice_number")).toBe("90210");
  });

  /*
    Without the keyword anchor this would match almost any token on the page, so
    an unanchored run must stay null rather than offer the reviewer noise.
  */
  it("stays null when no invoice or ref keyword is present", () => {
    expect(valueOf(fallbackExtract("ABC-123 appears alone"), "invoice_number")).toBeNull();
  });
});

describe("fields the fallback deliberately does not guess", () => {
  /*
    specs/domain.md scopes the fallback to "the three field types with
    recognisable shapes". A supplier name has no shape, and a wrong guess is
    worse for the reviewer than an empty box they expect to fill.
  */
  it("leaves supplier_name and supplier_tax_id null even on a rich invoice", () => {
    const fields = fallbackExtract(INVOICE);
    expect(valueOf(fields, "supplier_name")).toBeNull();
    expect(valueOf(fields, "supplier_tax_id")).toBeNull();
  });
});
