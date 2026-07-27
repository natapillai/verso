# Decisions

Choices that closed off an alternative. Appended to as slices land, newest slice
last. A decision belongs here when someone reading the code later could
reasonably ask "why not the other way".

## Slice 01, scaffold

**The Blob store is private, and documents are read through a function.**
Invoices are client documents, so nothing in the store is readable by URL alone.
The cost is that the review screen in slice 03 cannot put `blob_url` straight
into an `<img>`; it needs a route that calls `get()` and streams the bytes.
Public storage with an unguessable pathname would have avoided that route.
Rejected because "the URL is hard to guess" is not an access control, and a
store's access mode cannot be changed after it is created, so this is the
decision that had to be made early rather than late.

**The Neon WebSocket driver, not the HTTP one.**
`neon-http` is faster for single statements and would serve every query in this
slice. It has no interactive transactions. Invariant 2 in `specs/domain.md`
requires the field update and its correction row to commit together, which is an
interactive transaction, so the driver that supports it is chosen now rather
than swapped in during slice 03. The cost is a `ws` dependency and a connection
pool to keep alive across dev reloads.

**Upload answers 202, not 201.**
The route stores bytes and a row and stops. Nothing has read the document, so no
extracted resource exists to point at. 202 says accepted-not-processed, which is
exactly the state, and it keeps the contract honest when extraction becomes a
separate step. A repeat upload answers 200 with `duplicate: true`, because
nothing was created.

**Deduplication trusts the unique index, not the lookup.**
`receiveFile` looks the hash up first, but only as a fast path that saves a
pointless blob write. The guarantee is `documents_content_hash_key` plus
`on conflict do nothing ... returning`, and an empty return is read as "somebody
else won the race" rather than treated as an error. A lookup-then-insert would
pass its own check and then fail under two simultaneous uploads of the same
file, which is a real case when a reviewer double clicks.

**The blob is written before the row exists.**
A failed insert therefore leaves an orphaned blob. Accepted rather than solved:
the alternative is a nullable `blob_url`, an insert, an upload, and an update,
which trades a rare orphan for a permanently nullable column that every later
query has to consider. The blob pathname is the content hash, so a retry
overwrites the orphan instead of accumulating another one.

**Bounding boxes are four columns with check constraints, not one jsonb.**
Invariant 6 says boxes are normalised zero to one. Four `double precision`
columns let the database refuse a value outside that range and refuse a box
missing a corner, both of which are now tested. `jsonb` would be one column and
would enforce nothing.

**The whole schema ships in one migration, including columns nothing writes.**
`extractions` and `corrections` are created empty in slice 01. Writing them now
means slices 02 and 03 add behaviour without adding migrations, which matters
because migrations are forward only and never edited after merge. The columns
are not speculative: each one is named by `specs/domain.md` or
`specs/extraction.md`.

**Thresholds live on the extraction row.**
`threshold` and `sample_rate` are columns on `extractions`, not constants read at
query time. Invariant 5: tuning them later must not retroactively change what
counted as auto accepted. Reading them from `src/domain/thresholds.ts` at
display time would make accuracy history fiction the first time the number moved.

**Tailwind's default palette and type scale are dropped, not shadowed.**
`globals.css` sets `--color-*: initial` and `--text-*: initial` before declaring
the six colours and five sizes from `specs/design.md`. Keeping the defaults
available would mean a stray `bg-slate-200` in a later slice compiles silently,
and the claim that six tokens are the whole system would quietly stop being true.
The cost is that any genuinely new colour has to be added to the token block on
purpose, which is the point.

**Migrations run in the build command.**
`build` is `pnpm db:migrate && next build`. `specs/delivery.md` wants migrations
applied in a predeploy step so a deploy cannot serve traffic against an
unmigrated schema, and Vercel's build command is that hook. Safe because every
pull request gets its own Neon branch, so a migration never runs against a
database another branch is using.

**Dependencies not named in `CLAUDE.md` that the pipeline forces.**
`eslint` and `eslint-config-next` because `pnpm lint` is a required job.
`@vitest/coverage-v8` because the `unit` job passes `--coverage`.
`@tailwindcss/postcss` because that is how Tailwind v4 builds. `dotenv` because
the drizzle-kit CLI does not read `.env.local` the way Next does. `ws` because
the Neon WebSocket driver needs a socket constructor in Node. Each is listed
here so it reads as a decision rather than drift.

## Slice 02, extraction

**Invariant 1 lives in a pure function, not in the write.**
`src/domain/extraction-merge.ts` decides which fields an extraction may touch;
`src/server/extractions.ts` writes exactly that list and has no other path into
`fields`. The alternative was enforcing it at the point of the update, which
would have been simpler to write and impossible to test where it matters: CI has
no database, and the `degraded` job is where this guarantee has to hold. The
tradeoff is that the invariant depends on the server not growing a second write
path, so there is also a `setWhere` on the upsert restricting it to
`auto_accepted` and `needs_review` — the database refuses the write even if the
planner is ever wrong.

**A `sampled` field is preserved by re-extraction.**
Invariant 1 names a closed allowlist: a re-extraction "only populates fields
whose status is `auto_accepted` or `needs_review`". `sampled` is not in it. The
competing reading is that the invariant protects human input, and nobody has
looked at a sampled field yet, so it is fair game. The allowlist won because it
is what the spec says and because replacing a drawn sample between the draw and
the review would quietly change what was being verified.

**Sampling is keyed on `documentId:fieldName`, not the field row's uuid.**
`specs/domain.md` says "a seeded pseudorandom function of the field id". A row's
uuid does not exist before its first insert, so a first extraction could not
compute one, and a re-extraction would have to reuse the old row's id to stay
stable. The composite is the same identity, is known before the row exists, and
is stable across reloads and re-extractions, which is the property the spec is
protecting. Rejected: `Math.random()`, which would make a field appear and vanish
between reloads, and a process-seeded PRNG, which would not survive a restart.

**Plain JSON parsed by Zod, not the structured outputs API.**
Structured outputs would make a schema failure nearly impossible, which sounds
like an improvement until you notice it turns "fails schema parse twice, then
fallback" into unreachable code. `specs/domain.md` wants that path real, and the
`degraded` job exists to keep it honest. Zod remains the boundary either way, so
nothing is trusted that would otherwise have been.

**`image_width` is measured from the bytes being sent.**
`specs/extraction.md` wants the width recorded because images are the expensive
part of a request and the README quotes a measured cost. Reading the PNG or JPEG
header on the way out cannot drift from what actually happened; taking the
browser's word for it would need a new column on `documents` and a second
migration. `src/extract/image.ts` is hand-rolled rather than a dependency,
because it is two headers.

**A document reaches `ready` even when the fallback found nothing.**
Two parts of the spec pull in different directions here. `specs/domain.md` says
`failed` means "both extraction attempts failed and the fallback also produced
nothing usable", and with an image and no OCR step the fallback produces exactly
that. But success criterion 4 in `specs/product.md` says removing the API key
must still let documents "reach a reviewer, with every field flagged for review",
and a `failed` document is off the review path. So `failed` is reserved for the
case where no fields could be written at all — an unreadable blob — and eight
flagged empty fields count as reaching a reviewer. The criterion is the more
specific statement about the case that actually occurs.

**The fallback reads text, and an image supplies none.**
The regexes are implemented and tested against the three field types the spec
names, but there is no OCR step by design, so an image gives them nothing to work
on and the fallback returns eight flagged empty fields. That is still the
behaviour success criterion 4 asks for. The regexes earn their keep the moment
any text source exists — a PDF text layer, or a paste — and the alternative was
either an OCR dependency the spec forbids or deleting logic the spec requires.

## Slice 03, the review screen

**The tether measures against its own SVG, not the containing element.**
The obvious implementation takes a ref on the split container and measures
everything relative to it. It does not work: React attaches refs child first, so
a child's layout effect runs while the parent's ref is still null, and the tether
never draws until something unrelated re-renders. The SVG is positioned inset-0
inside the split, so its own rect is the same coordinate space and is guaranteed
to exist by the time its own effect runs.

**The tether writes to the SVG directly rather than through React state.**
The line follows the document as it scrolls, so geometry recomputes on every
scroll frame. Holding it in state would mean a re-render per frame to move two
shapes. This is the "synchronise with an external system" case effects are for.

**One commit per edit, guarded by a ref.**
Enter commits a correction, which unmounts the input, which fires blur, which
commits again. Both requests read the field before either wrote, so a single edit
produced two correction rows — and invariant 2 exists so that a value change is
accounted for exactly once. A value counted twice against the model is a number
the accuracy view gets wrong. The guard is a ref rather than state because it has
to be read and set synchronously inside one handler.

**The screen focuses its first field on mount.**
Without it the reviewer lands with focus on the body, outside the key handler,
and the first Enter goes nowhere until they click a field. That is friction in
the one path the screen exists for, and it matters most on arrival at the next
document after a completion, where the rhythm should carry over.

**Confirmations are applied locally before the server answers.**
The measured path is eight Enters, and waiting on a round trip between them would
put network latency into the only interaction anyone times. A failed request puts
the previous status back and says so. The risk accepted: a reviewer can get
several fields ahead of a server that is refusing, and only finds out at the end.

**Zoom needs `max-width: none`.**
Tailwind's preflight caps images at 100% of their container, which silently pins
zoom at fit however many times the control is pressed. Worth recording because
the symptom — a button that appears to do nothing — looks like a state bug and is
a stylesheet default.

**The correction log is read through the field row.**
Success criterion 3 asks that a correction, the original model value, and the
actor all survive a reload. A row that says "was GB556201447 · nata" answers that
where the reviewer already is. A separate log panel would be a second place to
look for something only ever wanted in context.

**A single reviewer, named by environment variable.**
`specs/product.md` puts authentication out of scope and `specs/domain.md` says a
reviewer is a handle with no password. This is enough for criterion 3 and not
enough for two people on one batch; a handle picker belongs in what I would do
next.

## Slice 04, accuracy

**`fields.initial_status`, and the migration I said would not be needed.**
In slice 01 I claimed the schema landed complete and no later slice would add a
migration. That was wrong. Two of the three accuracy numbers are defined over a
field's status *before* review — field accuracy over "needs_review fields plus
sampled fields", auto accept precision "restricted to fields that were sampled" —
and `status` is overwritten the moment a reviewer confirms. I modelled the
statuses as one mutable column without thinking through what the accuracy queries
would need to read back, so those two numbers were not computable at all.

**Storing the decision rather than deriving it.**
It is nearly derivable: confidence against the extraction's threshold gives auto
accepted versus needs review, and sampling is a deterministic function of the
field's identity. Rejected for two reasons. It would put the sampling rule in a
second place, in SQL, where a change to `src/domain/sampling.ts` would make the
two disagree silently with no test failing. And it would break invariant 5 — a re
extracted field points at a new extraction row with possibly different settings,
so deriving from the current row would retroactively reclassify history, which is
the exact fiction that invariant exists to prevent.

**Null, not zero, when nothing has been reviewed.**
`NULLIF` in the queries and `accuracyRatio` returning null rather than `NaN` or
`0`. A zero on this page reads as "the model got everything wrong" when the truth
is "nobody has looked yet", and a reader acts differently on those two. The page
renders `—`.

**The page refuses to judge the threshold on a small sample.**
`specs/domain.md` says to say plainly when precision drops below roughly 0.97.
`specs/extraction.md` says calibration needs a few hundred sampled fields. Taken
together, a precision of 0.50 over two draws should not raise an alarm and a 1.00
over three should not sound an all clear, so below about thirty samples the page
says the number is not standing on anything yet. The alternative — applying the
0.97 rule from the first sample — would make the headline number noise for the
entire early life of the system, which is exactly when someone is deciding
whether to trust it.

**One correction count in `--mark`, not two.**
The first version of the table marked both the per-field corrected column and the
corrected-in-sample figure. `specs/design.md` allows one correction count on this
view and says to cut a fourth use if it appears in review. It appeared; it was
cut. The sample figure is muted, alongside sample size, because precision is the
headline in that block and the rest are supporting.

**Preview and production share one Anthropic key.**
`specs/delivery.md` calls for separate keys so a preview cannot spend the
production budget. They are the same key, deliberately, and recorded here so the
README does not imply an isolation that is not there. Separate keys alone would
not have created separate budgets in any case — billing is per account, and the
mechanism that would actually cap preview spend is a separate workspace with its
own monthly limit.

**Corrections outside the sample are reported, not folded in.**
A field that was auto accepted, never drawn for verification, and then corrected
by a reviewer who opened it anyway was invisible in all three numbers: outside
the field accuracy population, outside the sample, and excluded from time saved
because a human had touched it. That is the same shape as the hole the random
sample exists to close — a metric quietly flattering itself — and it is the
strongest evidence the product can produce that the threshold is wrong.

It could have been folded into auto accept precision, and was not, because that
would bias the estimate in both directions at once. A reviewer pressing Enter
through auto accepted fields has not examined them, so counting those
confirmations would inflate the ratio; counting only the corrections would
deflate it. The drawn sample stays the unbiased number and this is reported
beside it, where it raises the threshold warning regardless of sample size —
evidence of a real error does not need a large sample to be worth acting on.

The alternative readings were to widen field accuracy to any field a human
touched, which sweeps in the six auto accepted confirmations of an eight-Enter
run and inflates the denominator, or to leave the signal out entirely and note
the limitation in the README. Both were rejected: the first corrupts the number,
the second knowingly ships a blind spot.

## Slice 05, the deliverable

**The seed drives the HTTP API rather than inserting rows.**
`scripts/seed.mjs` uploads, extracts, confirms and corrects through the endpoints
a reviewer's browser uses. Inserting rows directly would be faster, free, and
would let the demo numbers be chosen rather than measured. Rejected because the
whole claim of this product is that its numbers come from work actually done, and
a demo whose numbers were typed in undermines that in the one place a reader
looks. It also closed a real gap: every accuracy figure before this slice had
only ever been checked against rows I wrote by hand.

**The seeded documents are generated PDFs, hand-rolled in about eighty lines.**
`scripts/invoice-pdf.mjs` writes the PDF bytes directly, using the built-in
Helvetica so nothing needs embedding. The alternatives were committing twenty
images, which puts megabytes in the repository, or adding a rendering dependency,
which `CLAUDE.md` rules out. The unexpected benefit is a text layer, which is the
first thing the regex fallback has ever had to work on outside its unit tests.

**"Hard to read" had to mean ambiguous, not faint.**
The first version of the two difficult documents printed pale grey text at a small
size. It changed nothing: average confidence came back 0.990, identical to the
other eighteen, with not one field flagged. Faintness is a property of a
*rasterised* page, and a PDF carries an exact text layer, so there was nothing
faint about what the model received. The redesign gives it genuine ambiguity
instead — the same reference struck twice at identical coordinates, a truncated
year, a tax id one digit short, and three competing totals with transposed
digits. Worth recording because the first version looked convincing in a
screenshot and was measuring nothing.

**The prompt still does not ask for low confidence on ambiguity.**
Even with the redesigned documents only one field across 160 came back flagged.
The prompt instructs low confidence for values the model *cannot read*, and an
ambiguous value is perfectly readable — it just has two candidate answers. The
honest fix is a prompt change measured against labelled fixtures, which is the
`pnpm eval` harness that was never built, so changing the prompt by eye here would
be guessing dressed up as a fix. Left as it is, and named.

**A `GET /api/documents/[id]/fields` route, added for the seed.**
The seed needs to know what extraction produced before it can decide what to
confirm and what to correct. Reading the database directly would have meant
handing the seed script database credentials and a second copy of the schema; the
route means `pnpm seed -- --url https://…` works against a deployment with no
credentials at all. It is a read-only projection of what the review screen already
receives.

**The e2e specs paint a unique marker into the fixture before uploading.**
Invariant 4 makes the same bytes one document, so a spec that uploads a fixture
verbatim deduplicates, from its second run onward, into the document its first run
already reviewed and completed. Renaming does not help — the name is not hashed —
and neither does image metadata, because `downscale()` redraws anything wider than
1600px through a canvas and keeps only the pixels. So `e2e/fixture.ts` paints two
random colour blocks into the bottom margin, in the page, because the browser
holds the only image encoder either spec has. The alternative was uploading a
freshly generated PDF, which is three lines instead of thirty and gives up the
only e2e coverage of downscaling and the recorded image width.

**Focus is held in a ref, and the actions read the ref.**
The screen invites clicking a field and typing straight into it, since any
character begins a correction. Those two events can land in the same frame, before
React has re-rendered, and a handler reading render-time state then acts on the
field that was focused a moment ago — putting the correction on the wrong row and
writing a correction row against a value the reviewer never disagreed with. State
still decides what is drawn; the ref decides what is acted on. The same race
applies to Enter held down through the eight-field rhythm, where key repeat
outruns a render easily.

**Focus returns to the row in an effect, not in the commit.**
Committing unmounts the input, and focusing the row in the same breath lands on
the Save button that is about to be removed with it, after which focus falls to
the body and the keyboard is dead until the reviewer clicks something. It is the
same failure the landing effect prevents, one step later in the rhythm. The effect
runs after the row is drawn again, so there is somewhere for the focus to go.

**`e2e.yml` triggers on `deployment_status`.**
Waiting for a Vercel preview otherwise means a third-party action or a polling
loop. Vercel posts the deployment, GitHub fires the event, and the URL arrives on
it as `environment_url`. The guard keeps it to successful non-production
deployments, so merging to `main` never points the specs at production. The cost
is that the check is not attached to the pull request the way `verify` is, and has
to be added to branch protection by name.

**The specs run against a deployment they did not start.**
`playwright.config.ts` has no `webServer`. It points at `E2E_BASE_URL`, defaulting
to localhost. A config that starts its own server would test a build nobody is
going to use; `specs/delivery.md` wants these two specs covering "what only breaks
once the whole thing is assembled", and the assembled thing is the preview
deployment with its real database and its real blob store.

## Slice 06, the way in

**The landing page is the queue.**
Until this slice it listed only the documents you had uploaded in the current
browser session, held in React state and gone on reload. That was fine while the
only way to see a document was to have just uploaded it, and it quietly defeated
the point of seeding: twenty demo documents sat in the database and a stranger
opening the deployed URL saw an empty form. Success criterion 1 in
`specs/product.md` is that a stranger understands the product within thirty
seconds without a walkthrough, and it was not met by a system that showed them
nothing. The upload result list is still there, because "what did this upload just
do" is a different question from "what is there to review", and answering the
second in place of the first would lose the duplicate message.

**Queue state is carried by the left edge, exactly as a field row is.**
A document with fields still owed attention gets a two pixel `--ink` edge; every
other document gets none. `--mark` is not used on this page at all. It has three
places in this product and a queue is not one of them, so the corrected count on a
row is muted like every other piece of supporting text.

**A batch is one upload request, and the seed now uses three of them.**
This was already true and had never been visible. Uploading the twenty seeded
invoices one at a time made twenty batches of one document, so the review header
read "Batch 52 · 0 of 1 done" on every screen and the batch number in the queue
told a reader nothing. `specs/design.md` draws that header as "Batch 14 · Acme
Supplies · 6 of 22 done", which only means something if a batch holds more than
one document. The seed now sends three labelled batches whose boundaries line up
with how far review got, so the queue reads as a place of work rather than a list:
one intake cleared, one part way through, one not started.

**The upload route accepts an optional label.**
`batches.label` has existed since slice 01 and nothing had ever written to it. One
optional form field, ignored when absent, rather than a second endpoint.

**The file input is moved out of sight rather than styled.**
`::file-selector-button` can be styled but the "No file chosen" text beside it
cannot, and it renders as browser chrome in the middle of the page. The input
keeps its id, its name, its `required` and its label and does all the work; a
label styled as a button sits in its place, and the focus ring is drawn on that
label through `peer-focus-visible` so the quality floor still holds. Playwright's
`setInputFiles` works on it unchanged, which is what kept both specs passing.

## Slice 07, the page a reviewer actually sees

**The seeded documents are rendered images, not generated PDFs.**
This reverses the slice 05 decision directly above, and the reason is not taste.
The document panel puts the file in an `<img>`, and no browser renders a PDF that
way — it shows a broken image and reports nothing. So every one of the twenty
seeded documents produced an empty left panel on the deployed URL, and the
tether, which `specs/design.md` calls the one place to spend effort, had nothing
to draw against. The PDFs were chosen for size and for their text layer, and
never once checked against the screen that had to display them.

The pages are laid out in HTML and photographed in Chromium, which adds no
dependency because Playwright is already here for the browser specs, and which
produces something that looks like a page rather than like output from a script.
`scripts/invoice-pdf.mjs` is deleted rather than left sitting unused.

What this gives up is the text layer, and with it the only real exercise the
regex fallback had outside its unit tests. Recorded in `docs/architecture.md`
rather than glossed. What it buys is the product working: region outlines, the
tether, zoom, and the browser downscale path all run against the demo corpus now,
and none of them did before.

**A PDF is given to the browser's own viewer, and gets no region box.**
PDFs remain an accepted upload, so the panel has to handle one. The native viewer
paginates and scales inside its own frame, so a normalised bounding box cannot be
mapped onto it honestly. `specs/design.md` would rather the tether degrade than
be faked, which it already does below 1000px, so the same applies here: no line,
no box, and the focused field is still named in the text alternative. The zoom
controls are hidden for a PDF too, because the viewer brings its own and two sets
of controls with one of them inert is worse than one.

**The wordmark goes home.**
There was no way out of a document except the browser's back button. A reviewer
should not have to leave the product's own controls to do something the product
should own. It is `next/link` rather than an anchor, which the lint rule insists
on and which keeps the queue a client navigation.

**The invoices carry a bank block and a bill-to.**
Partly because a page with eight fields and nothing else does not look like an
invoice, and partly because a sort code and an account number put a second run of
digits a short distance from the VAT number. Reading `supplier_tax_id` off a page
where it is the only long number is not the task; reading it off a page with three
is.

## Slice 08, the tether is removed

**The model cannot locate a value on the page, and now there is a number for it.**
`pnpm eval:boxes` renders invoices whose printed values are tagged, so their true
positions are known exactly, sends them through the real upload and extract path,
and compares. The result on the seeded corpus: **10% of boxes land on the value,
mean IoU 0.05**. Claude Sonnet scores 0% on the same pages, so this is not a
question of model tier — it is that a vision model asked in prose for coordinates
returns a plausible-looking ladder rather than a measurement. The boxes step down
the page at a regular interval, are roughly right at the top and drift, and are
about twice the size of the text they claim to enclose.

Three things had to be fixed before that number could be trusted, and each was
hiding the next. The prompt's single worked example anchored the model, which
copied its box dimensions verbatim into all eight fields. Rewriting it to forbid
that overcorrected — "a null box is better than an invented one" was read as
permission to stop trying, and every box came back null. And then the harness
itself was wrong: it read `box` from the fields route, which had never returned
one, and reported that nothing had been placed when everything had.

**So the tether is gone.** `specs/design.md` calls it the signature element and
"the one place to spend effort", and its whole argument is that "a highlight box
alone makes the reviewer's eye search for it. The tether removes that search."
A line drawn to the wrong place does not remove the search, it adds one, and it
does so with more confidence than a reviewer has any reason to give it. The same
spec says to degrade honestly rather than fake — below 1000px the tether was
already meant to degrade — and this is that rule applied to the case where the
data underneath it turned out not to exist.

Rejected alternatives. Keeping it and documenting the 10% in the README: a
limitation a reader has to look up does not stop the screen misleading the person
using it. Keeping the line and dropping only the tight outline: the line
terminates at the same wrong coordinates, roughly two text rows out, so it makes
the same claim more vaguely. Switching models: measured, no better.

**Boxes are still extracted, stored and constrained.** Invariant 6 stays real,
the check constraints still refuse a box outside zero to one or missing a corner,
and the harness keeps measuring. Nothing presents them as truth. That leaves the
door open for the fix that would actually work — a text layer or a detection
model to locate values against — without pretending the fix is already here.

**`--mark` now has two uses, not three.** The third was the region outline.
`specs/design.md` fixes the number at three and says to cut a fourth if one
appears; it does not contemplate losing one. Two is the safe direction to miss in
— the constraint exists so the one red thing on screen means something, and it
still does.
