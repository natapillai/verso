# Architecture

Written against what is in the repository, not against what the specs said would
be built. Where the two differ there is a section at the end saying so.

## The five paths

Everything the product does is one of five request paths.

**The queue.** `/` is a server component over one query in `src/server/queue.ts`,
listing every document with its batch, its state, and how many of its fields are
still owed attention. It is what makes a seeded deployment legible: success
criterion 1 asks that a stranger understand the product within thirty seconds,
and until this existed the landing page listed only what you had uploaded in the
current browser session, so seeded documents were in the database and invisible.

**Upload.** The browser redraws any image wider than 1600px through a canvas and
sends JPEG at quality 0.9 (`src/ui/downscale.ts`), then posts the files to
`/api/upload`. The route hashes the bytes with sha256, writes them to a private
Blob store under a pathname that *is* the hash, and inserts a document row. New
file answers 202, a hash already present answers 200 and points at the document
that already exists. A PDF is passed through untouched — there is no canvas path
for one, and rasterising it in the browser would mean a PDF renderer in the
bundle.

**Extraction.** A second request, `/api/documents/[id]/extract`, fired by the
client once the upload answers. It is deliberately not part of the upload: the
upload accepts bytes and returns, reading the page happens after. The route sends
the image or the PDF to the Anthropic Messages API, parses the reply against a
Zod schema, and on two failed attempts falls back to regexes over any text it can
find. Either way it writes one `extractions` row — model, prompt version,
threshold, sample rate, image width — and upserts eight `fields`.

**Review.** `/review/[id]` is a server component that loads the document and its
fields and hands them to one client component. Four small routes serve it:
`confirm`, `correct`, `complete`, and `file`, which streams the blob because the
store is private and the bytes are not reachable by URL.

A batch is one upload request. That is worth knowing before reading the header:
uploading files one at a time produces one batch per document, and the batch
progress the header shows then reads "0 of 1 done" everywhere.

**Accuracy.** `/accuracy` is a server component over four raw SQL queries, below.

## What may import what

```
src/domain/   pure. no next, no drizzle, no fetch. tested without a database.
src/extract/  talks to the model. takes its transport by injection.
src/server/   the only code that touches Postgres or Blob.
src/ui/       presentational. no business logic.
src/app/      routes and pages, thin.
```

The direction is one way: `app` and `ui` may reach into `domain`, nothing reaches
back. Twelve test files, 162 tests, none of which need a database or a network,
which is what lets the `degraded` CI job run the whole domain and extraction
suite with `ANTHROPIC_API_KEY` set to empty.

## Where the invariants are actually enforced

Naming the line of code matters more than restating the rule.

| Invariant | Enforced at |
|---|---|
| 1. Extraction never overwrites a human-touched field | `src/domain/extraction-merge.ts` plans the writes; `src/server/extractions.ts` puts the same allowlist in the upsert's `setWhere`, so the database refuses it too |
| 2. A value change and its correction row commit together | `src/server/review.ts`, one interactive transaction — which is why the Neon WebSocket driver is used rather than the HTTP one |
| 3. A document cannot complete with fields outstanding | `src/domain/completion.ts`, checked server side in `completeDocument` |
| 4. The same file twice is one document | a unique index on `documents.content_hash` plus `on conflict do nothing`; the lookup in front of it only saves a pointless blob write |
| 5. Settings are recorded per extraction | `threshold` and `sample_rate` are columns on `extractions`, never read from `src/domain/thresholds.ts` at display time |
| 6. Boxes are normalised zero to one | four `double precision` columns with check constraints, so the database refuses a bad box |

## The accuracy queries

`specs/product.md` success criterion 5: every number on the accuracy view traces
to one query here. Each is one statement. Paste it next to the figure on the page
and run it — they should agree digit for digit.

All three read `fields.initial_status`, which is what extraction decided, rather
than `fields.status`, which review overwrites. `specs/domain.md` defines the
populations in terms of the pre-review state, and once a reviewer confirms a
sampled field its `status` is `confirmed` and the fact it was drawn is gone.

### 1. Field accuracy, per field name

`confirmed / (confirmed + corrected)`, over fields a person actually looked at —
which means fields extraction flagged as `needs_review` plus the ones it drew as
`sampled`. Fields that were auto accepted are excluded: a reviewer pressing Enter
past seven certain fields did not scrutinise them, and counting them would
inflate the denominator with agreement nobody really gave.

```sql
SELECT name,
       count(*) FILTER (WHERE status = 'confirmed')                        AS confirmed,
       count(*) FILTER (WHERE status = 'corrected')                        AS corrected,
       count(*) FILTER (WHERE status IN ('confirmed', 'corrected'))        AS reviewed,
       count(*) FILTER (WHERE status = 'confirmed')::numeric
         / NULLIF(count(*) FILTER (WHERE status IN ('confirmed', 'corrected')), 0) AS accuracy
FROM fields
WHERE initial_status IN ('needs_review', 'sampled')
GROUP BY name
ORDER BY name;
```

The `NULLIF` is load bearing. With nothing reviewed the answer is `NULL`, which
the page renders as `—`. A zero would read as "the model got everything wrong"
when the truth is "nobody has looked yet", and those are opposite conclusions.

### 2. Auto accept precision

The same ratio restricted to the random sample of fields that were accepted
without review. This is the number that answers whether the fields nobody checked
were safe to not check.

```sql
SELECT count(*) FILTER (WHERE status = 'confirmed')                        AS confirmed,
       count(*) FILTER (WHERE status = 'corrected')                        AS corrected,
       count(*) FILTER (WHERE status IN ('confirmed', 'corrected'))        AS sample_size,
       count(*) FILTER (WHERE status = 'confirmed')::numeric
         / NULLIF(count(*) FILTER (WHERE status IN ('confirmed', 'corrected')), 0) AS precision
FROM fields
WHERE initial_status = 'sampled';
```

`sample_size` is shown beside the figure because the figure means nothing without
it. Below roughly thirty samples the page declines to judge the threshold at all
rather than raising an alarm or an all-clear on a handful of draws.

### 3. Time saved, in seconds

```sql
SELECT count(*)      AS fields_never_touched,
       count(*) * $1 AS seconds_saved
FROM fields
WHERE initial_status = 'auto_accepted'
  AND status = 'auto_accepted';
```

`$1` is `MANUAL_SECONDS_PER_FIELD` from `src/domain/thresholds.ts`, passed in
rather than written into the SQL, and rendered beside the result so a reader can
disagree with the assumption rather than the arithmetic.

`initial_status = 'auto_accepted'` is "never sampled" — a drawn field carries
`sampled` instead. `status` still `auto_accepted` is "no human ever touched it".
Together they are the strictest honest reading.

### 4. Corrections found outside the sample

Fields that were auto accepted, never drawn for verification, and corrected by a
reviewer who opened them anyway.

```sql
SELECT count(*) AS corrected_outside_sample
FROM fields
WHERE initial_status = 'auto_accepted'
  AND status = 'corrected';
```

Each one is direct proof that auto accept let a wrong value through — the most
alarming signal the product can produce. Until this query existed it was
invisible in every number: outside the field accuracy population, outside the
sample, and excluded from time saved because a human had touched the field.

It is reported **beside** auto accept precision rather than folded into it, and
deliberately so. A reviewer pressing Enter through auto accepted fields has not
examined them, so counting those confirmations would inflate the ratio; counting
only these corrections would deflate it. Either way the drawn sample stops being
a fair estimate. The sample stays the unbiased number and this sits next to it,
and it raises the warning regardless of how large the sample is — because it is
evidence that does not depend on the sample being big enough to trust.

### Supporting: the settings these numbers were judged by

```sql
SELECT DISTINCT threshold, sample_rate
FROM extractions
ORDER BY threshold, sample_rate;
```

Invariant 5 puts the threshold and sample rate on each extraction row at the time
it ran, so tuning them later cannot retroactively change what counted as auto
accepted. The page reports what was actually in force, and lists every distinct
pair if more than one is in play — averaging them would be the fiction the
invariant exists to prevent.

## Why `initial_status` exists

It was added in `drizzle/0001`, after the first three slices, because the accuracy
queries could not be written without it. `fields.status` is mutable and review
overwrites it; two of the three numbers are defined over the state before a human
touched the field.

Deriving it instead was considered and rejected twice over. It would put the
sampling rule in a second place, in SQL, where it could silently disagree with
`src/domain/sampling.ts`. And it would break invariant 5: a re-extracted field
points at a new extraction row with possibly different settings, so reading
today's threshold would retroactively reclassify history.

## Where the build diverged from the specs

Each of these is a place the specs describe something the repository does not do,
or does differently. They are here rather than quietly absent.

**One shared preview database, not a Neon branch per pull request.**
`specs/delivery.md` asks for a branch per pull request, seeded, dropped on merge,
and gives a good reason: two open branches running migrations against one
database costs an afternoon. Every preview shares one Neon branch instead. The
integration that would automate the per-pull-request branch was not set up, and
with slices landing one at a time there were never two open pull requests to
collide. The cost is real and worth naming: the second concurrent pull request
that changes the schema will break the first one's preview, and the e2e specs
write into the same database the seeded demo corpus lives in.

**Preview and production share one Anthropic key.**
The spec asks for separate keys so a preview cannot spend the production budget.
Recorded in `docs/decisions.md` with the reasoning — briefly, separate keys on
one account do not create separate budgets, and the thing that would actually cap
preview spend is a separate workspace with its own limit.

**Half of `pnpm eval` exists.**
`specs/extraction.md` describes a harness over labelled fixtures, run against a
candidate prompt before it ships, so a prompt change is measured rather than
guessed. `pnpm eval:boxes` is the part that could be built honestly: the seeded
pages are generated here and tag every printed value, so a box has ground truth
and the model's answer can be scored against it. That is what caught the region
outlines being wrong.

Values and confidences still have no labelled answer, because that needs a
hand-labelled corpus rather than a generated one, so every decision about what
the prompt asks for is still made by judgement and checked by eye. That remains
the largest gap between the specs and the repository.

**The fallback cannot reach an image.**
The regexes in `src/extract/fallback.ts` are implemented and tested, but with no
OCR step by design an image gives them nothing, so for a photographed invoice the
fallback returns eight flagged empty fields. That still satisfies success
criterion 4 — every field reaches a reviewer flagged — but it means the regexes
have never run against anything but their unit tests. They briefly had a text
layer to work on when the seed produced PDFs; the seed produces images now, for
reasons below, and that took the only real text source with it.

**`initial_status` arrived as a second migration.**
In slice 01 the schema was declared complete, with the reasoning that later slices
should add behaviour rather than migrations. Slice 04 needed a column that was not
there. `drizzle/0001` adds it nullable and backfills, per the spec's own advice on
migration shape, but the claim was wrong when it was made.

**Documents are seeded through the HTTP API, not inserted.**
`scripts/seed.mjs` uploads, extracts, confirms and corrects through the same
endpoints a reviewer's browser uses, so the demo data is real output rather than
fixtures arranged to look like output. It is slower and it costs a few cents in
model calls. It also caught the thing hand-seeding never would have: until slice
05 the accuracy numbers had only ever been checked against rows written by hand,
never against rows written by the review path.

**The recorded image width tells you which path a document took.**
`extractions.image_width` is 1600 for anything a browser uploaded, because the
browser redraws anything wider than that, and the rendered width for anything
posted straight to the API — the seed does not downscale, since it is not a
browser. Null means a PDF, which has no canvas path. Worth knowing before reading
the column as a measure of anything.

**The model cannot locate a value, so the tether was removed.**
`specs/design.md` builds the review screen around a line from the focused field
to that value's region on the page. `pnpm eval:boxes` measures the boxes that
line was drawn from: 10% land on the value, mean IoU 0.05, and Sonnet is no
better. Boxes are still extracted, stored and constrained by invariant 6, and the
harness still scores them — nothing draws them. `docs/decisions.md` has the
reasoning and the alternatives that were rejected.

**The document panel could not display a PDF, and for a while every seeded
document was one.**
The panel puts the file in an `<img>`, which renders nothing for a PDF and fails
silently — a broken image where the page should be. The seeded corpus was PDFs,
so every review screen on the deployment was empty on the left and the tether had
nothing to draw against. Fixed in two places: the panel now gives a PDF to the
browser's own viewer, and the seed renders images.
