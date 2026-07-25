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
