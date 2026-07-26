import { sql } from "drizzle-orm";
import type { FieldName } from "@/domain/fields";
import { MANUAL_SECONDS_PER_FIELD } from "@/domain/thresholds";
import { db } from "./db/client";

/*
  The accuracy queries.

  specs/product.md success criterion 5: every number on the accuracy view traces
  to one query in docs/architecture.md. So each number here is one statement,
  written out in full rather than assembled from fragments, and copied verbatim
  into that document. If you want to check a figure on the page, you can paste
  the query next to it and run it.

  All three read `initial_status` — what extraction decided — rather than
  `status`, which review overwrites. specs/domain.md defines the populations in
  terms of the pre-review state: "needs_review fields plus sampled fields" for
  field accuracy, "restricted to fields that were sampled" for precision, and
  "auto_accepted and never sampled" for time saved.
*/

export type FieldAccuracyRow = {
  name: FieldName;
  confirmed: number;
  corrected: number;
  reviewed: number;
  /** Null when nobody has reviewed this field yet. Not zero. */
  accuracy: number | null;
};

/**
 * Field accuracy, per field name.
 *
 * Over fields a human actually looked at, which is what the model gets right
 * when it was asked. Auto accepted fields are excluded: a reviewer pressing
 * Enter past seven certain fields did not scrutinise them, and counting them
 * would inflate the denominator with agreement nobody really gave.
 */
export async function fieldAccuracy(): Promise<FieldAccuracyRow[]> {
  const result = await db.execute<{
    name: FieldName;
    confirmed: string;
    corrected: string;
    reviewed: string;
    accuracy: string | null;
  }>(sql`
    SELECT name,
           count(*) FILTER (WHERE status = 'confirmed')                        AS confirmed,
           count(*) FILTER (WHERE status = 'corrected')                        AS corrected,
           count(*) FILTER (WHERE status IN ('confirmed', 'corrected'))        AS reviewed,
           count(*) FILTER (WHERE status = 'confirmed')::numeric
             / NULLIF(count(*) FILTER (WHERE status IN ('confirmed', 'corrected')), 0) AS accuracy
    FROM fields
    WHERE initial_status IN ('needs_review', 'sampled')
    GROUP BY name
    ORDER BY name
  `);

  return result.rows.map((row) => ({
    name: row.name,
    confirmed: Number(row.confirmed),
    corrected: Number(row.corrected),
    reviewed: Number(row.reviewed),
    accuracy: row.accuracy === null ? null : Number(row.accuracy),
  }));
}

export type AutoAcceptPrecision = {
  confirmed: number;
  corrected: number;
  /** How many drawn samples this number is standing on. */
  sampleSize: number;
  precision: number | null;
};

/**
 * Auto accept precision.
 *
 * The number that matters: it answers whether the fields nobody checked were
 * safe to not check. Without the random sample this could not be asked at all —
 * accuracy would only ever be measured over the fields the model already knew it
 * was unsure about, which is the easy half.
 */
export async function autoAcceptPrecision(): Promise<AutoAcceptPrecision> {
  const result = await db.execute<{
    confirmed: string;
    corrected: string;
    sample_size: string;
    precision: string | null;
  }>(sql`
    SELECT count(*) FILTER (WHERE status = 'confirmed')                        AS confirmed,
           count(*) FILTER (WHERE status = 'corrected')                        AS corrected,
           count(*) FILTER (WHERE status IN ('confirmed', 'corrected'))        AS sample_size,
           count(*) FILTER (WHERE status = 'confirmed')::numeric
             / NULLIF(count(*) FILTER (WHERE status IN ('confirmed', 'corrected')), 0) AS precision
    FROM fields
    WHERE initial_status = 'sampled'
  `);

  const row = result.rows[0];
  return {
    confirmed: Number(row?.confirmed ?? 0),
    corrected: Number(row?.corrected ?? 0),
    sampleSize: Number(row?.sample_size ?? 0),
    precision: row?.precision == null ? null : Number(row.precision),
  };
}

export type TimeSaved = {
  fieldsNeverTouched: number;
  secondsSaved: number;
  /** Rendered beside the result so the assumption is arguable. */
  secondsPerField: number;
};

/**
 * Time saved, in seconds.
 *
 * `initial_status = 'auto_accepted'` is "never sampled" — a drawn field carries
 * 'sampled' instead. `status` still 'auto_accepted' is "no human ever touched
 * it". Together they are the strictest honest reading the spec asks for.
 */
export async function timeSaved(): Promise<TimeSaved> {
  const result = await db.execute<{
    fields_never_touched: string;
    seconds_saved: string;
  }>(sql`
    SELECT count(*)                                      AS fields_never_touched,
           count(*) * ${MANUAL_SECONDS_PER_FIELD}::int   AS seconds_saved
    FROM fields
    WHERE initial_status = 'auto_accepted'
      AND status = 'auto_accepted'
  `);

  const row = result.rows[0];
  return {
    fieldsNeverTouched: Number(row?.fields_never_touched ?? 0),
    secondsSaved: Number(row?.seconds_saved ?? 0),
    secondsPerField: MANUAL_SECONDS_PER_FIELD,
  };
}

export type SettingsInForce = { threshold: number; sampleRate: number };

/**
 * The threshold and sample rate the counted fields were actually judged by.
 *
 * Invariant 5 puts these on the extraction row precisely so that tuning them
 * later does not retroactively change what counted as auto accepted. So the page
 * reports what was in force rather than today's constants, and shows every
 * distinct pair if more than one is in play — averaging them would be the same
 * fiction the invariant exists to prevent.
 */
export async function settingsInForce(): Promise<SettingsInForce[]> {
  const result = await db.execute<{ threshold: string; sample_rate: string }>(sql`
    SELECT DISTINCT threshold, sample_rate
    FROM extractions
    ORDER BY threshold, sample_rate
  `);

  return result.rows.map((row) => ({
    threshold: Number(row.threshold),
    sampleRate: Number(row.sample_rate),
  }));
}
