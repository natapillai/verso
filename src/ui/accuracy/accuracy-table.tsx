import { describePrecision } from "@/domain/accuracy";
import { FIELD_LABELS } from "@/ui/field-labels";
import type {
  AutoAcceptPrecision,
  FieldAccuracyRow,
  SettingsInForce,
  TimeSaved,
} from "@/server/accuracy";

/*
  Three numbers as a plain table.

  TASKS.md: "A plain table, no charts. Charts are an hour you do not have and
  they add nothing a table does not say." Every figure sits next to the inputs it
  depends on, so a reader can disagree with the assumption rather than the
  arithmetic.

  --mark appears once here, on the correction count. That is its third and final
  use in the product, alongside the focused region's outline and a corrected
  field's left edge on the review screen.
*/

/** Null means nobody has looked yet, which is not the same as zero. */
function percent(ratio: number | null): string {
  return ratio === null ? "—" : `${(ratio * 100).toFixed(1)}%`;
}

function duration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export function AccuracyTable({
  fields,
  precision,
  saved,
  settings,
  caughtOutsideSample,
}: {
  fields: FieldAccuracyRow[];
  precision: AutoAcceptPrecision;
  saved: TimeSaved;
  settings: SettingsInForce[];
  caughtOutsideSample: number;
}) {
  const verdict = describePrecision(
    precision.precision,
    precision.sampleSize,
    caughtOutsideSample,
  );

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="font-display text-h1">Accuracy</h1>
      <p className="mt-2 text-small text-muted">
        Measured from reviewer corrections as people work, not sampled quarterly.
      </p>

      <section className="mt-10" aria-labelledby="field-accuracy">
        <h2 id="field-accuracy" className="font-display text-h2">
          Field accuracy
        </h2>
        <p className="mt-1 text-small text-muted">
          Confirmed over confirmed plus corrected, for fields a person actually
          looked at. What the model gets right when it was asked.
        </p>

        <table className="mt-4 w-full border-collapse text-body">
          <thead>
            <tr className="border-b border-rule text-left">
              <th scope="col" className="py-2 text-small font-normal text-muted">
                Field
              </th>
              <th scope="col" className="py-2 text-right text-small font-normal text-muted">
                Confirmed
              </th>
              <th scope="col" className="py-2 text-right text-small font-normal text-muted">
                Corrected
              </th>
              <th scope="col" className="py-2 text-right text-small font-normal text-muted">
                Accuracy
              </th>
            </tr>
          </thead>
          <tbody>
            {fields.length === 0 && (
              <tr>
                <td colSpan={4} className="py-4 text-small text-muted">
                  Nothing reviewed yet. Clear a document to start measuring.
                </td>
              </tr>
            )}
            {fields.map((row) => (
              <tr key={row.name} className="border-b border-rule">
                <th scope="row" className="py-2 text-left font-normal">
                  {FIELD_LABELS[row.name] ?? row.name}
                </th>
                <td className="py-2 text-right tabular-nums">{row.confirmed}</td>
                {/* The one use of --mark on this page. */}
                <td className="py-2 text-right tabular-nums text-mark">
                  {row.corrected}
                </td>
                <td className="py-2 text-right tabular-nums">
                  {percent(row.accuracy)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mt-10" aria-labelledby="auto-accept">
        <h2 id="auto-accept" className="font-display text-h2">
          Auto accept precision
        </h2>
        <p className="mt-1 text-small text-muted">
          The same ratio over the random sample of fields that were accepted
          without review. This is the number that answers whether the fields
          nobody checked were safe to not check.
        </p>

        <table className="mt-4 w-full border-collapse text-body">
          <tbody>
            <tr className="border-b border-rule">
              <th scope="row" className="py-2 text-left font-normal">
                Precision
              </th>
              <td className="py-2 text-right tabular-nums">
                {percent(precision.precision)}
              </td>
            </tr>
            <tr className="border-b border-rule">
              <th scope="row" className="py-2 text-left font-normal text-muted">
                Sample size
              </th>
              <td className="py-2 text-right tabular-nums text-muted">
                {precision.sampleSize}
              </td>
            </tr>
            <tr className="border-b border-rule">
              <th scope="row" className="py-2 text-left font-normal text-muted">
                Corrected in sample
              </th>
              {/*
                Muted, not --mark. The palette allows one correction count on
                this page and it is the per-field column above; this is a
                supporting figure for the precision headline, and a fourth use of
                red would start spending the colour rather than earning it.
              */}
              <td className="py-2 text-right tabular-nums text-muted">
                {precision.corrected}
              </td>
            </tr>
            {/*
              Kept out of the ratio above on purpose: these are unsolicited
              looks, so folding them in would bias the estimate. Reported here
              because a correction on a field nobody was asked to check is the
              strongest evidence the threshold is wrong.
            */}
            <tr className="border-b border-rule">
              <th scope="row" className="py-2 text-left font-normal text-muted">
                Corrected outside the sample
              </th>
              <td className="py-2 text-right tabular-nums text-muted">
                {caughtOutsideSample}
              </td>
            </tr>
          </tbody>
        </table>

        {/* specs/domain.md: say it plainly rather than leave it to be noticed. */}
        <p className="mt-3 text-small" role="status">
          {verdict.message}
        </p>
      </section>

      <section className="mt-10" aria-labelledby="time-saved">
        <h2 id="time-saved" className="font-display text-h2">
          Time saved
        </h2>
        <p className="mt-1 text-small text-muted">
          Fields a person never had to touch, times the manual baseline. Only
          fields nobody looked at count, which is the strictest honest reading.
        </p>

        <table className="mt-4 w-full border-collapse text-body">
          <tbody>
            <tr className="border-b border-rule">
              <th scope="row" className="py-2 text-left font-normal">
                Time saved
              </th>
              <td className="py-2 text-right tabular-nums">
                {duration(saved.secondsSaved)}
              </td>
            </tr>
            <tr className="border-b border-rule">
              <th scope="row" className="py-2 text-left font-normal text-muted">
                Fields never touched
              </th>
              <td className="py-2 text-right tabular-nums text-muted">
                {saved.fieldsNeverTouched}
              </td>
            </tr>
            <tr className="border-b border-rule">
              <th scope="row" className="py-2 text-left font-normal text-muted">
                Manual baseline
              </th>
              <td className="py-2 text-right tabular-nums text-muted">
                {saved.secondsPerField}s per field
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="mt-10" aria-labelledby="settings">
        <h2 id="settings" className="font-display text-h2">
          Settings these numbers were judged by
        </h2>
        <p className="mt-1 text-small text-muted">
          Recorded on each extraction at the time it ran, so tuning them later
          does not rewrite what already counted as auto accepted.
        </p>

        <table className="mt-4 w-full border-collapse text-body">
          <thead>
            <tr className="border-b border-rule text-left">
              <th scope="col" className="py-2 text-small font-normal text-muted">
                Threshold
              </th>
              <th scope="col" className="py-2 text-right text-small font-normal text-muted">
                Sample rate
              </th>
            </tr>
          </thead>
          <tbody>
            {settings.length === 0 && (
              <tr>
                <td colSpan={2} className="py-4 text-small text-muted">
                  Nothing extracted yet.
                </td>
              </tr>
            )}
            {settings.map((setting) => (
              <tr
                key={`${setting.threshold}-${setting.sampleRate}`}
                className="border-b border-rule"
              >
                <td className="py-2 tabular-nums">{setting.threshold}</td>
                <td className="py-2 text-right tabular-nums">{setting.sampleRate}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Success criterion 5: every number here is one documented query. */}
      <p className="mt-10 text-small text-muted">
        Every figure above traces to one query in docs/architecture.md.
      </p>
    </main>
  );
}
