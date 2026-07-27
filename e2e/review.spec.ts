import { expect, test } from "@playwright/test";
import { freshInvoice } from "./fixture";

/*
  Spec one of two, from specs/delivery.md: "Upload a fixture invoice, watch
  fields populate, confirm one and correct one, complete the document."

  This is the whole product in one pass — upload, blob, extraction, the review
  screen, invariant 2 and invariant 3 — and none of it is covered by the unit
  suite, which deliberately runs without a browser or a database.

  The fixture is a PNG rather than one of the seeded PDFs on purpose. Images are
  the only path that exercises browser downscaling and the recorded image width;
  a PDF skips both.
*/

test("a reviewer can clear a document end to end", async ({ page }) => {
  await page.goto("/");

  await page.setInputFiles("#file", {
    name: `invoice-${Date.now()}.png`,
    mimeType: "image/png",
    buffer: await freshInvoice(page),
  });
  await page.getByRole("button", { name: "Upload" }).click();

  // Extraction is a separate request after the upload answers, so the link
  // appears before the fields are filled.
  const reviewLink = page.getByRole("link", { name: "Review" });
  await expect(reviewLink).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/fields filled|manual/)).toBeVisible({ timeout: 90_000 });

  await reviewLink.click();
  await expect(page).toHaveURL(/\/review\//);
  const reviewUrl = page.url();

  // Eight fields, populated.
  const rows = page.locator("li[data-field-row]");
  await expect(rows).toHaveCount(8);
  await expect(page.getByRole("region", { name: "Fields" })).toBeVisible();

  /*
    The reviewer lands with the first field already focused, so the first Enter
    goes somewhere. Waiting on that is also what makes the rest of this spec
    honest: the review screen arrives as a full page load, and the eight rows are
    in the server HTML well before React is listening. Clicking a row before then
    does nothing at all, which is how the first draft of this spec managed to put
    its correction on the wrong field.
  */
  await expect(rows.first().getByRole("button").first()).toBeFocused();

  /*
    Correct one, by clicking it and typing straight over it — which is how a
    reviewer does it, and no pause in between. That is deliberate: the first run
    of this spec put the correction on the field that had been focused a moment
    earlier, because the keydown arrived before React had re-rendered the click.
  */
  const taxIdRow = page.locator('li[data-field-row="supplier_tax_id"]');
  await taxIdRow.getByRole("button").first().click();
  await page.keyboard.press("G");
  await page.keyboard.type("B000111222");
  await page.keyboard.press("Enter");

  // The correction shows what the value used to be and who changed it, which is
  // success criterion 3 in specs/product.md.
  await expect(taxIdRow.getByText(/^was /)).toBeVisible();

  // Confirm the rest, then complete. Enter confirms and advances, so starting at
  // the top and pressing it eight times settles every remaining field.
  await rows.first().getByRole("button").first().click();
  for (let i = 0; i < 8; i += 1) await page.keyboard.press("Enter");

  const completed = page.waitForResponse(
    (response) =>
      response.url().includes("/complete") && response.request().method() === "POST",
  );
  await page.keyboard.press("Control+Enter");
  expect((await completed).ok()).toBe(true);

  /*
    Completing carries the reviewer to the next document in the batch when there
    is one, which on a seeded deployment there usually is. So come back to this
    document rather than assuming we are still on it — which also proves the
    correction was written rather than held in component state, since this is a
    fresh server render.
  */
  await page.goto(reviewUrl);
  await expect(page.getByText(/^Done\./)).toBeVisible();
  await expect(
    page.locator('li[data-field-row="supplier_tax_id"]').getByText(/^was /),
  ).toBeVisible();
});
