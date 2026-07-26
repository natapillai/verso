import { FIELD_NAMES, type ExtractedField, type FieldName } from "@/domain/fields";

/*
  The deterministic replacement for the model, from specs/domain.md.

  Pure, no network, regex only. It runs when the model errors, times out at
  twenty seconds, or fails schema parse twice. Everything it produces carries
  confidence zero, so classify() sends all of it to needs_review and none of it
  can ever be auto accepted. That is deliberate: these are guesses, and a guess
  that could slip past a reviewer would put values into the accuracy numbers that
  no model produced and no human checked.

  It covers the three field types with recognisable shapes. A supplier name has
  no shape, so it is left null rather than guessed: an empty box the reviewer
  expects to fill beats a confident wrong answer they have to notice.
*/

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const CURRENCY_SYMBOLS: Record<string, string> = { "£": "GBP", $: "USD", "€": "EUR" };

/** Numbers with two decimal places, with or without thousands separators. */
const AMOUNT = /\d{1,3}(?:,\d{3})+\.\d{2}|\d+\.\d{2}/g;

const ISO_DATE = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
const SLASH_DATE = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g;
const DAY_MONTH_NAME = /\b(\d{1,2})\s+([A-Za-z]{3,9})\.?\s+(\d{4})\b/g;
const MONTH_NAME_DAY = /\b([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})\b/g;

const DUE_KEYWORD = /\bdue\b/gi;
const ISSUE_KEYWORD = /\b(?:issued?|invoice date|date of issue|dated)\b/gi;

/** An alphanumeric run anchored to an invoice or ref label. */
const INVOICE_NUMBER =
  /\b(?:invoice|inv|ref(?:erence)?)\b[\s.:#no]*?([A-Z0-9][A-Z0-9-/]{2,})/i;

type Found = { value: string; index: number };

export function fallbackExtract(text: string): ExtractedField[] {
  const values = extractValues(text);

  return FIELD_NAMES.map<ExtractedField>((name) => ({
    name,
    value: values[name] ?? null,
    // Never anything else. See the note at the top of this file.
    confidence: 0,
    box: null,
  }));
}

function extractValues(text: string): Partial<Record<FieldName, string>> {
  const amounts = findAmounts(text);
  const { issueDate, dueDate } = findDates(text);

  return {
    invoice_number: findInvoiceNumber(text),
    issue_date: issueDate,
    due_date: dueDate,
    currency: findCurrency(text),
    // Largest is the total, second largest the subtotal. Crude, and right often
    // enough on a document whose bottom line is its largest number.
    total: amounts[0],
    subtotal: amounts[1],
  };
}

function findAmounts(text: string): string[] {
  const seen = [...text.matchAll(AMOUNT)].map((m) => m[0].replace(/,/g, ""));
  return [...new Set(seen)].sort((a, b) => Number(b) - Number(a));
}

function findCurrency(text: string): string | undefined {
  for (const [symbol, code] of Object.entries(CURRENCY_SYMBOLS)) {
    if (text.includes(symbol)) return code;
  }
  return /\b(GBP|USD|EUR)\b/.exec(text)?.[1];
}

function findInvoiceNumber(text: string): string | undefined {
  return INVOICE_NUMBER.exec(text)?.[1];
}

/**
 * Dates, mapped to issue and due by proximity to keywords.
 *
 * Due is resolved first because "due" is the less ambiguous label; whatever it
 * claims is removed from the pool before issue is resolved, so one date can
 * never fill both. A lone date with no keyword near it is treated as the issue
 * date, which is the more common single date on an invoice.
 */
function findDates(text: string): {
  issueDate: string | undefined;
  dueDate: string | undefined;
} {
  const dates = findAllDates(text);
  if (dates.length === 0) return { issueDate: undefined, dueDate: undefined };

  const dueAnchors = anchorPositions(text, DUE_KEYWORD);
  const issueAnchors = anchorPositions(text, ISSUE_KEYWORD);

  const dueDate = nearest(dates, dueAnchors);
  const remaining = dates.filter((d) => d !== dueDate);
  let issueDate = nearest(remaining, issueAnchors);

  // No issue keyword, but a date is left over: an invoice with one date is
  // almost always showing its issue date.
  if (!issueDate && dueAnchors.length === 0 && remaining.length > 0) {
    issueDate = remaining[0];
  }

  return { issueDate: issueDate?.value, dueDate: dueDate?.value };
}

function findAllDates(text: string): Found[] {
  const found: Found[] = [];

  for (const m of text.matchAll(ISO_DATE)) {
    found.push({ value: `${m[1]}-${m[2]}-${m[3]}`, index: m.index });
  }
  for (const m of text.matchAll(SLASH_DATE)) {
    // Day first: the spec's examples are UK style, and a British invoice is the
    // assumed case. Ambiguous for the first twelve days of a month either way.
    found.push({ value: iso(Number(m[3]), Number(m[2]), Number(m[1])), index: m.index });
  }
  for (const m of text.matchAll(DAY_MONTH_NAME)) {
    const month = MONTHS[m[2]!.slice(0, 3).toLowerCase()];
    if (month) found.push({ value: iso(Number(m[3]), month, Number(m[1])), index: m.index });
  }
  for (const m of text.matchAll(MONTH_NAME_DAY)) {
    const month = MONTHS[m[1]!.slice(0, 3).toLowerCase()];
    if (month) found.push({ value: iso(Number(m[3]), month, Number(m[2])), index: m.index });
  }

  return dedupeByPosition(found).sort((a, b) => a.index - b.index);
}

/** Two patterns can match the same text; keep one entry per position. */
function dedupeByPosition(found: Found[]): Found[] {
  const byValue = new Map<string, Found>();
  for (const item of found) {
    const existing = byValue.get(item.value);
    if (!existing || item.index < existing.index) byValue.set(item.value, item);
  }
  return [...byValue.values()];
}

function anchorPositions(text: string, pattern: RegExp): number[] {
  return [...text.matchAll(pattern)].map((m) => m.index);
}

/** The date closest to any anchor, if one is close enough to be meant. */
function nearest(dates: Found[], anchors: number[]): Found | undefined {
  if (anchors.length === 0) return undefined;

  let best: Found | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const date of dates) {
    for (const anchor of anchors) {
      const distance = Math.abs(date.index - anchor);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = date;
      }
    }
  }

  // Far enough away and the keyword was about something else on the page.
  return bestDistance <= 40 ? best : undefined;
}

function iso(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
