import { loadQueue } from "@/server/queue";
import { Queue } from "@/ui/queue";
import { UploadForm } from "@/ui/upload-form";

/*
  The way in.

  Success criterion 1 in specs/product.md: a stranger opens the deployed URL and
  understands the product within thirty seconds without a walkthrough. Three
  things have to be true for that. They have to be told what this is in one
  sentence. They have to see real documents rather than an empty form, which is
  what the seeded queue below is for. And they have to be able to get into one
  without deciding anything, which is why a row is a link and the queue is
  ordered with the newest first.

  Quiet, per specs/design.md. No card grid, no dashboard. The document is the
  subject and this page is the corridor to it.
*/

// The queue changes as documents are uploaded and reviewed, and a cached corridor
// showing yesterday's work would be worse than no corridor.
export const dynamic = "force-dynamic";

export default async function Page() {
  const queue = await loadQueue();

  return (
    <>
      <header className="flex items-baseline justify-between gap-4 border-b border-rule bg-panel px-6 py-3">
        <span className="font-display text-h2">VERSO</span>
        <a href="/accuracy" className="text-small underline underline-offset-2">
          Accuracy
        </a>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="font-display text-h1">Invoices, read once and checked once</h1>
        <p className="mt-3 max-w-prose text-muted">
          A model reads each page and fills eight fields. You confirm what is
          right and correct what is not — and because every correction is
          recorded, the accuracy of the extraction is a live number rather than a
          quarterly audit.
        </p>

        <UploadForm />
        <Queue queue={queue} />

        <p className="mt-10 text-small text-muted">
          Fields the model is confident about are accepted automatically, and a
          random sample of them is reviewed anyway — otherwise the fields nobody
          checks are the fields the number knows nothing about.{" "}
          <a href="/accuracy" className="underline underline-offset-2">
            See what it measures
          </a>
          .
        </p>
      </main>
    </>
  );
}
