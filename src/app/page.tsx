import { UploadForm } from "@/ui/upload-form";

/*
  Slice 01 only. This page exists so the deployed URL can be exercised: upload a
  file, upload it again, see one document. The review screen in slice 03 is
  where the design in specs/design.md gets built.
*/
export default function Page() {
  return (
    <main>
      <h1 className="font-display text-h1">Verso</h1>
      <p>
        Upload invoices. A model fills the fields and a reviewer confirms them.
      </p>
      <UploadForm />
    </main>
  );
}
