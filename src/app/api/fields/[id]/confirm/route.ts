import { NextResponse } from "next/server";
import { FieldNotFoundError, confirmField } from "@/server/review";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse<{ ok: true } | { error: string }>> {
  const { id } = await params;

  try {
    await confirmField(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof FieldNotFoundError) {
      return NextResponse.json({ error: "That field is not here." }, { status: 404 });
    }
    // planConfirmation refuses to confirm a corrected field, because that would
    // drop the correction from the accuracy numbers while keeping the value.
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not confirm that field." },
      { status: 422 },
    );
  }
}
