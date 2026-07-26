import { NextResponse } from "next/server";
import { CompletionBlockedError, completeDocument } from "@/server/review";

export const runtime = "nodejs";

export type CompleteResponse = { nextDocumentId: string | null };

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse<CompleteResponse | { error: string; outstanding?: string[] }>> {
  const { id } = await params;

  try {
    return NextResponse.json(await completeDocument(id));
  } catch (error) {
    // Invariant 3. The message names the outstanding fields rather than just
    // saying no, so the reviewer knows where to go next.
    if (error instanceof CompletionBlockedError) {
      return NextResponse.json(
        { error: error.message, outstanding: error.outstanding },
        { status: 422 },
      );
    }

    return NextResponse.json(
      { error: "Could not complete this document." },
      { status: 500 },
    );
  }
}
