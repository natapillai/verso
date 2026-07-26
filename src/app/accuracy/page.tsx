import {
  autoAcceptPrecision,
  fieldAccuracy,
  settingsInForce,
  timeSaved,
} from "@/server/accuracy";
import { AccuracyTable } from "@/ui/accuracy/accuracy-table";

export const runtime = "nodejs";
// Accuracy updates as people work, so it is never served from a cache.
export const dynamic = "force-dynamic";

export default async function AccuracyPage() {
  const [fields, precision, saved, settings] = await Promise.all([
    fieldAccuracy(),
    autoAcceptPrecision(),
    timeSaved(),
    settingsInForce(),
  ]);

  return (
    <AccuracyTable
      fields={fields}
      precision={precision}
      saved={saved}
      settings={settings}
    />
  );
}
