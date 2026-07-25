# Delivery spec

Sized for three days by one person. Every choice here is about getting a working pipeline early and keeping it green, rather than building the pipeline you would build for a team of eight.

## Branching

`main` is always deployable. One branch per slice, named `slice/NN_name`, one pull request each. Branch protection on, so the pipeline is real rather than decorative.

## Environments

| Environment | Trigger | Database |
|---|---|---|
| Preview | Every pull request | Neon branch per pull request, seeded, dropped on merge |
| Production | Merge to `main` | Neon primary |

A database branch per pull request rather than a shared staging database. Two open branches running migrations against one database is a trap that costs an afternoon, and you do not have an afternoon.

## Pipeline

`.github/workflows/verify.yml`, on every pull request and every push to `main`.

```yaml
name: verify
on:
  pull_request:
  push:
    branches: [main]

concurrency:
  group: verify-${{ github.ref }}
  cancel-in-progress: true

jobs:
  static:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm lint

  unit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm test:unit --coverage

  degraded:
    name: unit tests with the model unavailable
    runs-on: ubuntu-latest
    env:
      ANTHROPIC_API_KEY: ""
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm test:unit --run src/domain src/extract
```

The `degraded` job is the one to point at in review. Everyone writes graceful degradation into a README. Almost nobody proves it on every commit.

`.github/workflows/e2e.yml`, on pull requests only, waits for the Vercel preview then runs two Playwright specs against the live URL.

1. Upload a fixture invoice, watch fields populate, confirm one and correct one, complete the document.
2. Upload the same file twice, get one document and the duplicate message.

Two specs. The logic worth covering is pure and already unit tested without a browser. These two cover what only breaks once the whole thing is assembled.

## Migrations

Drizzle generated SQL, checked in, forward only, never edited after merge. Applied in a predeploy step so a deploy cannot serve traffic against an unmigrated schema. Add columns nullable, backfill, tighten later, so the previous version can still run if you need to roll back.

## Vercel

Node runtime for anything touching Postgres or Blob. Environment variables documented in `.env.example` with descriptions and no values. Separate `ANTHROPIC_API_KEY` for preview and production so a preview cannot spend the production budget.

## Gates that block a merge

`static`, `unit`, and `degraded` green. Vercel preview succeeded. Both Playwright specs green against the preview.

## The README you actually submit

Not a narration of the code. It opens with what the problem is and what the product does about it, points at the three or four things worth looking at on the live URL, states the measured numbers and where they come from, names the decisions that closed off alternatives, and ends with what you would do next.

Write it last, when you know what you actually built. Budget an hour and do not compress it, because for most readers it is the whole submission.

## Storage notes

Vercel Blob authenticates by OIDC. The SDK pairs `BLOB_STORE_ID` with `VERCEL_OIDC_TOKEN`, which Vercel populates and rotates automatically. There is no long lived token to manage, and `BLOB_READ_WRITE_TOKEN` is only needed for code running outside Vercel or for generating browser upload tokens, neither of which applies here.

Locally the OIDC token expires. When uploads start failing with an auth error while everything else works, that is what happened. Run `vercel env pull .env.local` again. Do it at the start of every work session rather than diagnosing it mid slice.

Server side uploads cap at 4.5MB of request body on Vercel. A phone photo or a scanned PDF can exceed that.

Downscale the image in the browser before uploading, to a max width of about 1600px. This solves the limit and the extraction cost in the same step, since images are the expensive part of the model request and the page only needs to be legible, not archival. Record the width sent on the extraction row, per `specs/extraction.md`.

Client side uploads direct to Blob would also solve the limit and are the wrong trade here. They add a token exchange, a webhook callback that does not reach localhost during development, and an authorisation surface, in exchange for supporting file sizes this product does not need.
