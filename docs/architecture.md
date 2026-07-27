# Architecture

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
