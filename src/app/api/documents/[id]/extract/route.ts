import { NextResponse } from "next/server";
import { DocumentNotFoundError, runExtraction } from "@/server/extractions";

// Postgres and Blob both need the Node runtime, per specs/delivery.md.
export const runtime = "nodejs";

/*
  Extraction is its own request. CLAUDE.md: do not let extraction run inside the
  upload request. Upload accepts bytes and answers 202; reading the page is a
  separate, slower, spendier step that is allowed to fail on its own.
*/

export type ExtractResponse = {
  documentId: string;
  extractionId: string;
  source: "model" | "fallback";
  fieldsWritten: number;
  fieldsPreserved: number;
  state: string;
};

export type ExtractError = { error: string };

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse<ExtractResponse | ExtractError>> {
  const { id } = await params;

  try {
    const result = await runExtraction(id);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof DocumentNotFoundError) {
      return NextResponse.json(
        { error: "That document is not here. Upload it again." },
        { status: 404 },
      );
    }

    return NextResponse.json(
      {
        error:
          "Could not read this page. The fields are blank and yours to fill.",
      },
      { status: 500 },
    );
  }
}
