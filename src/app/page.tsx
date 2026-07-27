import { UploadForm } from "@/ui/upload-form";

/*
  The way in. Upload a batch, then review each document.

  Deliberately plain: specs/design.md spends its detail on the review screen,
  which is the thing people use for hours. Slice 05 replaces this with something
  a stranger can land on and understand.
*/
export default function Page() {
  return (
    <main>
      <h1 className="font-display text-h1">Verso</h1>
      <p>
        Upload invoices. A model fills the fields and a reviewer confirms them.
      </p>
      <UploadForm />
      <p>
        <a href="/accuracy">Accuracy</a>
      </p>
    </main>
  );
}
