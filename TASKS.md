# Build plan

Five slices, roughly fourteen hours, across Friday evening to Sunday evening. Submit Monday morning with hours in hand rather than minutes.

Every slice ends deployed and demoable. The pipeline gets exercised on slice one rather than discovered on slice five.

## Slice 01, Friday evening, about 3 hours

Scaffold and the road out.

Next.js with TypeScript strict, Tailwind wired to the six tokens from `specs/design.md` as CSS custom properties, Neon connected, the full schema in one migration, Vercel Blob configured, upload with content hash deduplication, the `verify` workflow, deployed to production.

Done when you can upload a file to the live URL, it deduplicates on a second upload, and CI is green.

Do not build extraction, do not build the review screen, do not style anything beyond the tokens. The point of this slice is that everything after it deploys itself.

## Slice 02, Saturday morning, about 3 hours

Extraction.

The Anthropic client with vision, the prompt, the Zod schema, two attempts, the twenty second timeout, the regex fallback, the auto accept threshold, and the seeded sampling function. All of `src/domain` and `src/extract` unit tested. The `degraded` CI job goes green here.

Done when the whole suite passes with `ANTHROPIC_API_KEY` unset, and a real invoice returns eight fields with boxes.

Write the invariant test first. Re extract a document where one field was corrected, and assert the correction survived. That single test is the spine of the product.

## Slice 03, Saturday afternoon, about 4 hours

The review screen. This is the slice that matters and it gets the most time.

Split layout, document panel with zoom, field column, the tether, confirm, correct, the correction log, keyboard bindings, completion blocking.

Done when you can clear a document with eight Enters and one Cmd Enter, and when clicking any field outlines exactly the right region.

If time runs short anywhere in the three days, take it from slice 04, never from here.

## Slice 04, Sunday morning, about 2 hours

Accuracy.

Per field accuracy, auto accept precision over the sampled fields, and time saved, each traced to one documented query. A plain table, no charts. Charts are an hour you do not have and they add nothing a table does not say.

Done when a figure on screen matches the same query run by hand.

This is the cut candidate. If Saturday overran, ship the three numbers as a bare table and move on.

## Slice 05, Sunday afternoon, about 3 hours

The deliverable.

Twenty seeded documents so the live URL is immediately legible, the two Playwright specs, `docs/architecture.md`, `docs/decisions.md`, `AI_USAGE.md`, and the README.

Done when a stranger opens the URL and understands the product without being told.

Do not skip this slice. Documentation is a graded step in the assessment and it is also where the engineering judgment becomes visible. A finished small system with a good README beats an ambitious half built one every time.

## The cut list, in order

If you are behind, cut in this order and stop when you are back on schedule.

1. The accuracy view becomes three numbers in a table.
2. Zoom and pan on the document panel becomes fit to width only.
3. The sampling logic ships with the rate set to zero, and the README says why it exists and that it is not yet switched on.
4. One Playwright spec instead of two.

Never cut the tether, the correction log, the `degraded` CI job, or the README.
