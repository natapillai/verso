import { expect, test } from "@playwright/test";
import { freshInvoice } from "./fixture";

/*
  Spec two of two, from specs/delivery.md: "Upload the same file twice, get one
  document and the duplicate message."

  Invariant 4 says the same file uploaded twice is one document. The unit suite
  proves the hash is stable and the planner reads a conflict correctly; what it
  cannot prove is that the unique index, the blob write and the route's status
  codes agree once they are assembled — which is exactly what breaks in practice.
*/

test("the same file uploaded twice is one document", async ({ page }) => {
  await page.goto("/");

  // Same bytes both times; the name differs to prove identity comes from the
  // content hash rather than the filename.
  const bytes = await freshInvoice(page);
  const name = `duplicate-${Date.now()}.png`;

  await page.setInputFiles("#file", { name, mimeType: "image/png", buffer: bytes });
  await page.getByRole("button", { name: "Upload" }).click();

  await expect(page.getByText("Added.")).toBeVisible({ timeout: 60_000 });
  const firstHash = await page.locator("code").first().innerText();

  // Upload the very same bytes under a different name.
  await page.setInputFiles("#file", {
    name: `renamed-${name}`,
    mimeType: "image/png",
    buffer: bytes,
  });
  await page.getByRole("button", { name: "Upload" }).click();

  await expect(
    page.getByText("Already have this one. Opened the existing document."),
  ).toBeVisible({ timeout: 60_000 });

  // One document, reached by the same content hash.
  await expect(page.locator("li")).toHaveCount(1);
  await expect(page.locator("code").first()).toHaveText(firstHash);
});
