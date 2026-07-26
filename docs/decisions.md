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
