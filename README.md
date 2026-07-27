# Verso

Invoice extraction with a human in the loop, where the accuracy number is
measured from the work rather than audited afterwards.

**Live:** https://verso-natarajan-pillais-projects.vercel.app

Named for the left hand page of an open book, which is the layout of the review
screen.

## The problem

A team doing data entry from documents has two numbers it cannot get at the same
time. It knows how many documents it processed. It does not know how accurate the
processing was, unless someone stops and audits a sample — which costs a person a
day, produces a figure that is a quarter out of date the moment it is written
down, and tells you nothing about which field types are failing.

Put a model in front of the work and the question gets sharper, not softer. The
model is fast and mostly right. Mostly right is not a number you can act on. You
cannot tell a client "our extraction is accurate" on the strength of a model
being confident, and confidence scores are not accuracy — they are the model's
opinion of itself.

## What Verso does

A model reads each uploaded invoice and fills eight fields. A reviewer opens the
document with the page on the left and the fields on the right, and confirms
rather than types. Every value they change writes a correction row in the same
transaction as the field update.

That last sentence is the whole product. Corrections are not a log; they are the
measurement. Because a correction can only exist where a human disagreed with the
model, the accuracy of the extraction is a running total of real disagreements,
available at any moment, at no extra cost to anybody's day.

Three things make the number trustworthy rather than flattering:

- **Extraction never overwrites a field a human has touched.** Re-running the
  model cannot quietly erase the evidence that it was wrong.
- **Fields the model is confident about are auto accepted, and a random sample of
  them is drawn for review anyway.** Without that, the fields nobody checks are
  exactly the fields the number knows nothing about.
- **The threshold and sample rate are recorded on every extraction as it runs.**
  Tuning them next month cannot retroactively change what counted as accurate
  last month.

## Six things worth looking at

1. **The queue.** The landing page lists every document with its batch and what
   it still wants from you, so the deployment is legible before you have uploaded
   anything. A row with fields still owed attention carries a two pixel left edge
   — the same signal a field row uses, because state is weight and never colour.
2. **The review screen.** Open any document from the queue. A good invoice clears
   in eight Enters and one Cmd Enter, and that path is what the screen is built
   around — the shortcut sheet is on `?`. Confidence is shown as the weight of the
   left edge of each field, never as colour, so the one coloured thing on screen
   means one thing: a value a human changed.
3. **The tether.** Focus a field and a line connects it to where that value sits
   on the page. It follows the document as you scroll and zoom. It is the reason
   confirming is faster than typing: you are checking a value against a place, not
   hunting for it.
4. **The accuracy view** at `/accuracy`. Three numbers, each traceable to one SQL
   query in [docs/architecture.md](docs/architecture.md). It is currently telling
   you that three auto accepted fields turned out to be wrong, and that supplier
   name is the weakest of the eight. Note also what it refuses to do: where
   nothing has been reviewed it prints `—` rather than `0`, because those are
   opposite conclusions, and on a small sample it declines to judge the threshold
   rather than sounding an all-clear on a handful of draws.
5. **`rst-0012`, in the May intake.** No VAT number is printed on that page
   anywhere, and the model returns an empty supplier tax ID at 95% confidence —
   it is *sure the field is absent*, which is a different and far more useful
   answer than a blank it could not read.
6. **Upload the same file twice.** One document, and a message saying so.
   Identity is the sha256 of the content, so renaming it changes nothing.

## The numbers, and where they come from

Measured from the seeded corpus of twenty invoices, which were uploaded,
extracted, reviewed and corrected through the product's own HTTP API — not
inserted. `scripts/seed.mjs` does the same things a reviewer's browser does.

These are the figures on the deployment as seeded. They move as anyone uses it,
which is the point — read `/accuracy` for the current ones.

| | |
|---|---|
| Field accuracy | 91.7% over the 12 fields a person actually looked at |
| Worst field | Supplier name, 66.7% — two right, one wrong |
| Auto accept precision | 91.7% over a sample of 12, one of which was wrong |
| Corrected outside the sample | 3 |
| Time saved | 21m 0s over 84 fields nobody had to touch, at a 15s manual baseline |
| Threshold / sample rate | 0.85 / 0.1 |

Nothing on that page reads 100%, and it was not arranged that way. The seed
confirms and corrects the same way a reviewer would, against whatever the model
actually returned, so the numbers are whatever they are.

**The interesting figure is the 3, not the 91.7%.** Those three fields were
auto accepted, never drawn for verification, and corrected by a reviewer who
opened them anyway. They sit outside both percentages by design — not in field
accuracy, because that population is fields a human was *asked* to check, and not
in the sample, because they were never drawn. Folding them into precision would
bias the estimate in both directions at once, so the page reports them beside it
and says what they mean:

> 3 auto accepted fields turned out to be wrong when someone looked. The
> threshold is letting errors through.

That is the product working. A confidence score of 0.99 on a wrong value is
exactly the failure the whole design is arranged to catch, and here it is caught,
counted, and stated on the page rather than absorbed into an average.

**A sample of 12 is not enough to judge a threshold, and normally the page
refuses to.** Twenty documents is 160 fields; at a 0.1 rate that is about 16
draws, against the 30 set as the floor for trusting the figure, so it would
ordinarily decline to judge rather than print a number. Here the three
corrections outrank that and it raises the alarm instead — evidence of real
errors does not need a large sample to be worth acting on. Raising the sample
rate to make the demo look better would have produced a nicer screenshot and a
worse product.

**Time saved counts only fields nobody touched at all**, which is the strictest
reading available, and the 15s manual baseline is printed next to the result so a
reader can disagree with the assumption rather than the arithmetic.

## Decisions that closed off alternatives

The full list is in [docs/decisions.md](docs/decisions.md), one entry per
decision, appended as each slice landed. The five that shaped the most:

**The correction row and the field update commit together, in one interactive
transaction.** That single requirement chose the database driver: the Neon HTTP
driver is faster for single statements and has no interactive transactions, so
the WebSocket driver was picked in slice 01 for something not built until slice
03. A correction that could be lost while its field update survived would make
every number on the accuracy page a guess.

**Model output is parsed by Zod and a parse failure is a failure.** Not repaired,
not coerced. Structured outputs from the API would make schema failure nearly
impossible, which sounds better until you notice it turns the fallback path into
unreachable code. Removing `ANTHROPIC_API_KEY` still gets a document to a reviewer
with all eight fields flagged, and a CI job runs the whole domain and extraction
suite with the key set to empty on every commit — so that claim is checked rather
than asserted.

**`initial_status` is stored, not derived.** It is nearly derivable from
confidence and the sampling function, and deriving it would put the sampling rule
in a second place, in SQL, where it could disagree with the TypeScript silently.
It would also break the guarantee above about recorded settings.

**Six colour tokens are the entire palette, and Tailwind's defaults are removed
rather than shadowed**, so a stray `bg-slate-200` fails to compile instead of
quietly making the claim untrue.

**No authentication, no multi-tenancy, no line items, one document type.** Out of
scope in `specs/product.md` and left out. The reviewer is a handle in an
environment variable.

## Running it

```bash
pnpm install
vercel env pull .env.local
pnpm dev
```

```bash
pnpm seed
```

Seeds twenty invoices through the running app — laying each page out in HTML,
photographing it in Chromium, then uploading, extracting, confirming and
correcting through the same endpoints a reviewer's browser uses. It needs no
database credentials because it only speaks HTTP, so
`pnpm seed -- --url https://…` points it at a deployment. It does need the
Playwright browser, which `pnpm exec playwright install chromium` provides.

```bash
pnpm typecheck && pnpm lint && pnpm test
```

162 tests, none of which need a database or a network. Two Playwright specs run
separately with `pnpm e2e`, against a deployment they do not start — in CI, the
Vercel preview.

## What I would do next, in order

1. **Build the eval harness.** `specs/extraction.md` describes it: twenty labelled
   fixtures, run against a candidate prompt before it ships. It was not built, so
   every prompt decision here was made by judgement and checked by eye. It is the
   largest gap between the specs and the repository, and everything below is worth
   less without it. Concretely, it would settle a known weakness — the prompt asks
   for low confidence on values the model *cannot read*, but an ambiguous value is
   perfectly readable and comes back at 99%, so ambiguity does not reach the
   review queue.
2. **Calibrate the threshold against real volume.** 0.85 is a starting guess.
   `specs/extraction.md` wants a few hundred sampled fields before the number
   means anything, and the machinery to collect them is already running.
3. **Rasterise PDFs so they get the tether too.** A PDF is handed to the browser's
   own viewer, which means no region outline and no line to it, because a
   normalised box cannot be mapped onto a viewer that paginates and scales inside
   its own frame. Rendering page one to an image on upload would put every
   document on the same footing, at the cost of a PDF library.
4. **A Neon branch per pull request.** Previews currently share one database, so
   two concurrent schema changes would collide, and the e2e specs write into the
   same database the demo corpus lives in.
5. **More than one reviewer.** A handle picker and per-reviewer accuracy, which
   the schema already supports — corrections record who made them.
6. **Line items.** Deliberately out of scope, and the honest next feature: it is
   where invoice extraction actually gets hard, because the field set stops being
   fixed.

## Reading the repository

| | |
|---|---|
| [specs/](specs/) | Written before the code. The contract, not documentation |
| [docs/architecture.md](docs/architecture.md) | How it fits together, the SQL behind each number, and where the build diverged from the specs |
| [docs/decisions.md](docs/decisions.md) | Every choice that closed off an alternative |
| [AI_USAGE.md](AI_USAGE.md) | Built with Claude Code. What it got wrong, and how each was caught |
| `src/domain/` | Pure logic. No framework, no database, tested without either |

Built as a technical assessment for Globalco over five slices, each one a branch,
a pull request and a green pipeline.
