# AI usage

Verso was built with Claude Code across five slices. Rather than say the model
was used and the output reviewed carefully, which tells a reader nothing, this
names what it got wrong, how each one was caught, and which decisions were mine.

## How it was worked

The specs in `specs/` were written first, by hand, and each slice was planned
against them and approved before any code was written. `CLAUDE.md` is the
operating contract the model worked under — strict TypeScript, no `any`, model
output parsed by Zod and never repaired, business logic out of components, scope
fixed by `specs/product.md` and `TASKS.md`.

That contract did most of the work. Almost everything below was caught by the
type checker, a test written before the code, or by running the thing in a real
browser. The failures that survived to be found late are the ones worth reading.

## Wrong, and how it was caught

**A schema declared complete that was not.**
Slice 01 shipped the whole database schema in one migration and argued that later
slices would add behaviour rather than migrations. Slice 04 could not compute two
of the three accuracy numbers, because both are defined over a field's status
*before* review and `status` is overwritten the moment a reviewer confirms it. The
statuses had been modelled as one mutable column without working through what the
accuracy queries would need to read back. `drizzle/0001` adds `initial_status`.
Caught by writing the queries, which is the last possible moment.

**A database guard whose comment claimed more than the code did.**
The upsert in `src/server/extractions.ts` carried a `setWhere` described as the
database enforcing invariant 1 even if the planner were wrong. The condition was
trivially true, so it enforced nothing while reading as a second line of defence —
worse than having no guard, because the comment invited trusting it. Now it is
`inArray(fields.status, ["auto_accepted", "needs_review"])`.

**A test that asserted a coin flip.**
A sampling test drew three values at probability 0.5 and asserted they were not
all the same, which fails one run in four. Rewritten to fifty draws asserting both
outcomes appear. Flaky tests are worse than missing ones and this one would have
started failing in CI, on someone else's pull request, weeks later.

**Two correction rows behind one edit.**
Enter commits a correction, which unmounts the input, which fires blur, which
commits again. Both requests read the field before either wrote. Invariant 2
exists so a value change is accounted for exactly once, and a value counted twice
against the model is a number the accuracy view gets wrong. Caught by looking at
the `corrections` table after using the screen, not by any test.

**A tether that never drew.**
It measured against a ref on the containing element. React attaches refs child
first, so the parent's ref is still null while the child's layout effect runs, and
the line never appeared until something unrelated re-rendered. It measures against
its own SVG now.

**A correction that landed on the wrong field.**
Found by the first run of the end-to-end spec in slice 05. Clicking a field and
typing immediately — which is exactly what the design invites, since any character
begins a correction — could put the correction on the previously focused row,
because the keydown arrived before React had re-rendered the click. That writes a
correction row against a value the reviewer never disagreed with, which is
precisely the kind of wrong number the product exists to avoid. Focus is now held
in a ref that the actions read.

**A keyboard that died after every correction.**
Committing an edit called focus on the row while the input was still rendered, so
it landed on the Save button that was about to be removed, and focus fell to the
body. The next Enter went nowhere until the reviewer clicked something. In a
screen whose entire premise is eight Enters and one Cmd Enter, that is the bug
that matters most, and it survived three slices of manual testing because every
manual test clicked before typing.

**A signature feature built on data the model does not produce.**
The tether — a line from a field to that value's region on the page — was built
in slice 03, verified by looking at it, and shipped. It was drawn from bounding
boxes the model returns, and nobody checked whether those boxes were right. They
were not: 10% of them land on the value. Worse, the prompt was causing it. One
worked example containing a box 0.26 by 0.04 was enough for the model to return
0.26 by 0.04 for all eight fields, stepping down the page at a fixed interval —
a ladder that looked like output and measured nothing. It took a user opening a
document and saying the highlight was on blank paper.

The fix was to build the measurement first, which is the thing
`specs/extraction.md` asked for at the start and I skipped. With the number in
hand the feature was removed rather than defended.

**Twenty seeded documents the review screen could not display.**
The worst one. The seed produced PDFs; the document panel puts the file in an
`<img>`, and no browser renders a PDF that way — it shows a broken image and
raises nothing. So the deployed URL had twenty documents whose entire left half
was blank, and the tether, the element the design spec singles out as the one
worth spending effort on, had nothing to draw against. Every layer was tested
except the one where they met: the seed was verified by reading the database and
the accuracy page, and the review screen was only ever exercised with the PNG
fixture from the browser specs. Nobody opened a seeded document and looked at it
until the person I was building it for did.

**Two seeded documents that were supposed to be hard to read and were not.**
They printed pale grey text at a small size. Average confidence came back 0.990,
identical to the other eighteen, and not one field was flagged. Faintness is a
property of a rasterised page; a PDF carries an exact text layer, so nothing about
what the model received was faint. It looked convincing in a screenshot and was
measuring nothing. Redesigned around genuine ambiguity — the same reference struck
twice at identical coordinates, a truncated year, three competing totals.

**Shell commands handed over that could not work. Twice, both branch protection.**
The first built nested JSON with repeated `-f` flags, which that flag cannot do.
The second fixed that with `--input -` and a `<<<` here-string — bash syntax,
handed to someone whose shell is PowerShell, where it is a parse error. Both were
run, both failed, and the second was reported back as a working directory problem,
which it was not. The fix that holds in either shell is `--input <file>`. The
lesson is narrow and worth stating: a command written for someone else to run has
to match the shell they actually have, and this project has said "Shell:
PowerShell" at the top of every session.

## Wrong diagnoses, which is a different failure

Three times the code was fine and the explanation was not. These are worth
separating out, because a confident wrong explanation is more expensive than a
bug — it sends someone to change the wrong thing.

**Blaming the framework for antivirus.**
A Neon WebSocket connection failed inside Next and the cause was given as the
Next bundle, in a code comment, where it would have misled the next reader
indefinitely. The actual cause was a local antivirus product intercepting TLS,
and an environment variable pointing at its certificate that one shell had and
another did not. The comment was corrected.

**Blaming the wrong Vercel Blob setting.**
An upload failure was diagnosed as the project-level OIDC setting while a dev
OIDC token was in fact issuing fine. The real fix was the store's connection to
the environment, plus propagation delay. Later, the same error appeared again and
was a token that had simply expired, which `specs/delivery.md` warns about on
exactly this point.

**Reporting a passing invariant as broken.**
While verifying slice 03, a malformed nested SQL assertion printed a failure for
an invariant that was in fact holding. Two other verification steps were also
wrong rather than the code: calling `.focus()` and setting `scrollTop`
programmatically emit no events in a non-compositing browser pane, so both looked
broken and were not.

**A third instrument that was wrong rather than the code.**
The box eval read `box` from the fields route, which had never returned one, and
reported that the model placed no boxes at all. Two prompt rewrites were made
against that reading before the raw model output was checked and found to contain
perfectly good boxes all along. Check the instrument before the subject: this is
the third time in this project the tool was the thing that was broken.

**Two probes that hid the bug they were written to find.**
Both slice 05 focus bugs above were, at first, not reproducible: a debugging
script that snapshotted the page between steps passed every time. The snapshots
were the reason — each one is a round trip that gave React time to re-render, so
the instrument removed the race it was measuring.

## Decisions that were mine, not the model's

**One Anthropic key for preview and production.** `specs/delivery.md` asks for
two. I kept one, knowing what it gives up, on the reasoning that two keys on one
account do not create two budgets anyway.

**Not rotating a database credential** that had been pasted into a chat window.
A deliberate call about a throwaway assessment database, and not one I would make
about anything real.

**How corrections found outside the sample are counted.** The model proposed
folding them into auto accept precision. I kept the drawn sample as the unbiased
headline and put these beside it as a separate labelled figure that raises the
warning regardless of sample size. Folding them in would have biased the estimate
in both directions at once. The reasoning is in `docs/decisions.md`.

**Stopping at three of the accuracy numbers**, and letting the page say "too few
samples to judge the threshold" rather than raising the sample rate so the demo
would have a number to show.

## What is not claimed

The prompt has never been measured. `specs/extraction.md` describes an eval
harness over twenty labelled fixtures, so a prompt change is measured rather than
guessed, and it was not built. Every prompt decision in this repository was made
by judgement and checked by eye. That is the honest state of the most important
file in `src/extract/`, and it is the first thing I would fix.
