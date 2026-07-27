import { defineConfig, devices } from "@playwright/test";

/*
  Two specs, run against a live deployment.

  specs/delivery.md: "The logic worth covering is pure and already unit tested
  without a browser. These two cover what only breaks once the whole thing is
  assembled." So this config does not spin up its own server or seed a database —
  it points at a URL that is already running, which in CI is the Vercel preview.

  E2E_BASE_URL comes from the deployment_status event in .github/workflows/e2e.yml.
*/

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  // Both specs upload; running them at once against one deployment invites
  // interference over a shared blob store and database.
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",

  use: {
    baseURL,
    trace: "retain-on-failure",
  },

  // Extraction is a real model call behind a twenty second budget with two
  // attempts, so a whole spec can legitimately take a while.
  timeout: 120_000,
  expect: { timeout: 30_000 },

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
