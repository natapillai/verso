# CLAUDE.md

Operating contract for this repository. Read this file, then `specs/product.md`, then the spec for the slice you are working on. Do not write code before that.

## What this is

Verso is a document extraction tool with a human in the loop. A model reads uploaded invoices and fills the fields. A reviewer confirms rather than types, and every correction they make is recorded per field, so extraction accuracy is a live measurement instead of a quarterly audit.

Named for the left hand page of an open book, which is the layout of the review screen.

Built as a technical assessment for Globalco, whose stated business includes data entry and structuring. The product deliberately sits inside that business.

## Non negotiables

1. TypeScript strict. No `any`. No `@ts-ignore` without a comment naming the reason.
2. Model output is never trusted. It is parsed against a Zod schema and a parse failure is a failure, not something to repair.
3. Extraction never overwrites a field a human has touched. Ever. This is the invariant that makes the accuracy numbers mean anything.
4. Every value change writes a correction row in the same transaction as the field update.
5. No business logic in components. Logic lives in `src/domain` and is unit tested without a database.
6. No secrets in the repo. `ANTHROPIC_API_KEY` lives in `.env.local` and in Vercel, and is never exported to your shell.
7. Scope is fixed by `specs/product.md` and `TASKS.md`. Anything outside it, say so instead of building it.

## Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js App Router, TypeScript | Vercel is the required deploy target |
| Database | Postgres on Neon | Serverless friendly, branch per pull request |
| Access | Drizzle ORM | Typed schema, readable migrations |
| Files | Vercel Blob | Documents are images, they do not belong in Postgres |
| Validation | Zod | One schema guards the API boundary and parses model output |
| Extraction | Anthropic Messages API, vision | Reads the page directly, so there is no OCR pipeline to build |
| Tests | Vitest, Playwright | Two browser specs only, see `specs/delivery.md` |
| CI | GitHub Actions | Required by the assessment |
| Styling | Tailwind over CSS custom properties | Tokens defined once in `specs/design.md` |

## Repository shape

```
src/
  app/               routes and pages, thin
  domain/            pure logic, no next or drizzle imports
    fields.ts        the invoice field set and its Zod schema
    accuracy.ts      accuracy and sampling maths
    thresholds.ts    auto accept rules
  extract/           model client, prompt, parser, fallback extractors
  server/            database access and transactions
  ui/                presentational components
specs/               written before code, the contract
docs/                written for the reader, the deliverable
```

## Definition of done for a slice

1. `pnpm typecheck`, `pnpm lint`, `pnpm test` pass.
2. New domain logic has tests for the failure path, not only the happy path.
3. The Vercel preview renders and the touched flow works in it.
4. Any choice that closed off an alternative is appended to `docs/decisions.md`.

## Voice for anything a person reads

Plain verbs, sentence case, active voice. A reviewer confirms a field or corrects it. They do not validate, submit, or process. Errors say what happened and what to do next, and never apologise. Empty states invite an action.

## What not to do

* Do not add authentication, multi tenancy, line item extraction, or a second document type. Out of scope.
* Do not install a component library. The design in `specs/design.md` is specific and a library will fight it.
* Do not build an OCR step. The model reads the image.
* Do not let extraction run inside the upload request.
* Do not write a README that narrates the code. Write the one described in `specs/delivery.md`.
