/**
 * Bumped whenever the wording below changes in a way that could move accuracy.
 * Stored on every extraction row so accuracy before and after a prompt change
 * can be compared rather than blurred together.
 */
export const PROMPT_VERSION = "2026-07-27.1";

/*
  specs/extraction.md fixes three rules for this prompt, and each one is here for
  a reason worth keeping:

  1. The box is asked for before the value. Locating first and reading second
     produces better values than reading first and locating afterwards, because
     the second ordering invites the model to justify a value it already guessed.
  2. Null with high confidence and null with low confidence are different states.
     Collapsing them loses the signal the whole product runs on: one means the
     field is genuinely absent, the other means the model could not tell.
  3. One worked example, not five. A single example fixes the format. More of
     them narrow the model toward the example's layout.
*/

export function extractionPrompt(): string {
  return `You are reading a single invoice page and filling eight fields.

Return only JSON. No prose, no explanation, no markdown fence.

The JSON has one key, "fields", holding exactly eight objects in this order:

  invoice_number, issue_date, due_date, supplier_name,
  supplier_tax_id, currency, subtotal, total

Each object has these keys, in this order:

  "name"        one of the eight names above
  "box"         where on the page you found it, or null
  "value"       what it says, or null
  "confidence"  0 to 1

Find the region on the page first and give the box, then read the value out of
that region. Do not read a value first and locate it afterwards.

The box is {"x0","y0","x1","y1"}, each 0 to 1 as a fraction of page width and
height, measured from the top left. Draw it tightly around the printed value
itself, not around the label beside it and not around the block it sits in.

Measure each box against what is actually on this page. Boxes that step down the
page at a regular interval, or that all share the same width and height, are a
sign of guessing rather than looking — a supplier name and a total sit in
different places and are different lengths, so their boxes cannot match. Give a
box for every value you can see; a null box is only for a value that is not
printed on this page at all.

About null values, which matter as much as the values you find:

  - The field is genuinely not printed on this page: value null, and give HIGH
    confidence, because you are confident about its absence.
  - You cannot tell, the page is cut off, or the text is unreadable: value null,
    and give LOW confidence.

Those are different answers. Do not collapse them into one.

Other rules:

  - Dates as YYYY-MM-DD.
  - Amounts as plain digits with a decimal point, no currency symbol and no
    thousands separators: 1463.20, not £1,463.20.
  - currency is the three letter ISO code, for example GBP.
  - subtotal is the amount before tax; total is the final amount payable.
  - Copy supplier_tax_id exactly as printed, including any letter prefix.

Worked example of the shape, for one field. The numbers in it describe one
particular page and say nothing about yours — take the format from it and
nothing else:

{"name":"total","box":{"x0":0.71,"y0":0.44,"x1":0.86,"y1":0.47},"value":"1463.20","confidence":0.97}

Now return the full JSON object with all eight fields.`;
}
