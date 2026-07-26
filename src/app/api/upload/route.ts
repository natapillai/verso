import { NextResponse } from "next/server";
import { UploadFileSchema } from "@/domain/upload";
import { receiveUpload, type ReceivedFile } from "@/server/documents";

// Postgres and Blob both need the Node runtime, per specs/delivery.md.
export const runtime = "nodejs";

export type UploadedDocument = {
  id: string;
  filename: string;
  contentHash: string;
  state: string;
  duplicate: boolean;
};

export type UploadResponse = {
  batchId: string | null;
  documents: UploadedDocument[];
};

export type UploadError = { error: string };

export async function POST(
  request: Request,
): Promise<NextResponse<UploadResponse | UploadError>> {
  let form: FormData;

  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "That upload was not a file. Choose a file and try again." },
      { status: 400 },
    );
  }

  const uploads = form.getAll("file").filter((part) => part instanceof File);

  if (uploads.length === 0) {
    return NextResponse.json(
      { error: "No file arrived. Choose at least one file and try again." },
      { status: 400 },
    );
  }

  const files: ReceivedFile[] = [];

  for (const upload of uploads) {
    const parsed = UploadFileSchema.safeParse({
      filename: upload.name,
      mimeType: upload.type,
      byteSize: upload.size,
    });

    if (!parsed.success) {
      const reason =
        parsed.error.issues[0]?.message ?? "Verso cannot read that file.";
      return NextResponse.json(
        { error: `${upload.name || "That file"}: ${reason}` },
        { status: 400 },
      );
    }

    files.push({
      filename: parsed.data.filename,
      mimeType: parsed.data.mimeType,
      bytes: new Uint8Array(await upload.arrayBuffer()),
    });
  }

  const result = await receiveUpload(files);

  const body: UploadResponse = {
    batchId: result.batchId,
    documents: result.documents.map(({ document, duplicate }) => ({
      id: document.id,
      filename: document.filename,
      contentHash: document.contentHash,
      state: document.state,
      duplicate,
    })),
  };

  // 202 because the documents are accepted, not read. Extraction is a separate
  // step and must not run inside this request.
  const anyNew = body.documents.some((document) => !document.duplicate);

  return NextResponse.json(body, { status: anyNew ? 202 : 200 });
}
