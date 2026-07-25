# Design spec

## The subject, pinned

A proofreader's desk. One document, one pair of eyes, and a red pencil that is used sparingly because most of the page is already right.

The review screen's single job is to let a person agree with eight values as fast as possible, and disagree with the one that is wrong without hunting for it.

## Direction

Quiet paper, one red mark. The interface is almost entirely neutral, and the only saturated colour in the product appears where a human has changed something. Red is earned by the data rather than spent on decoration.

Explicitly rejected during planning. Cream ground with a high contrast serif and a warm clay accent, which is the reflex answer for anything involving documents and says nothing about this one. A dark operations dashboard, which fights the fact that the primary object on screen is a white page. Card grids, because there is one document and it deserves the room.

## Colour

Six tokens. That is the whole system.

| Token | Hex | Use |
|---|---|---|
| `--ground` | `#EEF0EC` | Page. Cool neutral paper with a green cast, not cream. |
| `--panel` | `#FFFFFF` | The document surface and field rows |
| `--rule` | `#D5D9D2` | Hairlines, field dividers, the tether |
| `--muted` | `#6C736D` | Labels, confidence figures, timestamps |
| `--ink` | `#14263A` | Text, focus rings, primary actions |
| `--mark` | `#C0392B` | Corrections only, and the source region outline |

`--mark` appears in exactly three places. The outline of a focused field's region on the document, the left edge of a corrected field, and the correction count on the accuracy view. Nowhere else, ever. If a fourth use appears in review, cut it.

Confidence is shown as weight, not colour. A `needs_review` field carries a two pixel `--ink` left edge, a `sampled` field a dashed one, an `auto_accepted` field none. Colour is reserved so that the one red thing on the screen means something.

## Type

| Role | Face | Setting |
|---|---|---|
| Display | Spectral, weight 600 | Page titles and the field group headings only. A screen serif with real character, distinct from the usual editorial defaults. |
| Body | Public Sans | Field labels, buttons, everything read in sentences |
| Data | Martian Mono, small sizes only | Confidence percentages, content hashes, document ids. Used sparingly because it is wide. |

Field values are set in Public Sans with `tabular-nums`, not mono. They are content a person reads, not data a person scans, and the mono treatment would make a supplier name look like a serial number.

Scale, in rem, ratio 1.25.

```
h1     1.953
h2     1.25
body   1.0
small  0.8     labels, confidence
micro  0.64    hashes, ids
```

## Layout, the review screen

```
┌──────────────────────────────────────────────────────────────────────┐
│  VERSO      Batch 14 · Acme Supplies      6 of 22 done      nata     │
├───────────────────────────────────────┬──────────────────────────────┤
│                                       │  1 field needs you           │
│   ┌───────────────────────────────┐   │                              │
│   │                               │   │  Invoice number              │
│   │        INVOICE                │   │  INV-2024-0817          98%  │
│   │                               │   │                              │
│   │   INV-2024-0817  ◀────────────┼───┼──╴                           │
│   │                               │   │  Issue date                  │
│   │   Acme Supplies Ltd           │   │  17 Aug 2024            96%  │
│   │                               │   │                              │
│   │   Subtotal      1,240.00      │   │ ┆Supplier tax ID              │
│   │   Total         1,463.20      │   │ ┆GB2847••••              41% │
│   │                               │   │ ┆ needs you                  │
│   └───────────────────────────────┘   │                              │
│                                       │  Total                       │
│   page 1 of 1        fit  ─  +        │  1,463.20               99%  │
│                                       │                              │
│                                       │  Confirm all · Complete ⌘⏎   │
└───────────────────────────────────────┴──────────────────────────────┘
```

Document left, fields right, fixed proportion of roughly three to two. The document panel scrolls and zooms independently. The field column never scrolls out of reach of the keyboard.

Below 1000px the two stack, document above fields, and the tether becomes a scroll to region plus an outline instead.

## Signature element, the tether

When a field takes focus, a thin `--rule` line is drawn from the left edge of the field row across the gutter to the region on the document, which is outlined in `--mark`. The line follows if the document is scrolled.

A highlight box alone makes the reviewer's eye search for it. The tether removes that search. It is the difference between the tool telling you where to look and the tool making you find it, and across two hundred documents that difference is the product.

This is the one place to spend effort. Everything else stays quiet.

## Keyboard, because this is a data entry tool

| Key | Action |
|---|---|
| Tab and Shift Tab | Move between fields |
| Enter | Confirm the focused field and advance |
| Any character | Begin correcting the focused field |
| Escape | Abandon the correction, restore the model value |
| Cmd or Ctrl Enter | Complete the document |
| `?` | Shortcut sheet |

Every shortcut also has a visible control. A keyboard only interface is a training burden.

A reviewer clearing a good document should be able to press Enter eight times and Cmd Enter once. Time that path and make sure nothing gets in its way.

## Motion

The tether draws over 180ms with an ease out, because a line that appears instantly reads as a rendering artefact and a line that draws reads as a connection. The corrected state washes in over 200ms. Focus rings are instant, always.

That is all of it. This is a tool people use for hours and animation becomes noise fast.

Under `prefers-reduced-motion` the tether appears without drawing and the wash is a plain state change. Nothing is lost.

## Quality floor

Focus visible everywhere in `--ink` at 2px. Contrast verified against `--ground` and `--panel` rather than assumed. The field column is a real list with real labels for a screen reader, and the bounding box outline has a text alternative naming the region. Works down to mobile, where the tether degrades honestly rather than being faked.

## Copy

| Moment | Copy |
|---|---|
| Field needs attention | needs you |
| Empty batch | Nothing to review. Upload a batch to start. |
| Duplicate upload | Already have this one. Opened the existing document. |
| Extraction failed | Could not read this page. The fields are blank and yours to fill. |
| Model unavailable | Filling fields automatically is off right now. Everything still works, it is just manual. |
| Completion blocked | Two fields still need you before this one can be completed. |
| Completed | Done. Seven fields were already right. |

Errors say what happened and what to do next. They never apologise and never say something went wrong.
