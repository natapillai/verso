import { NextResponse } from "next/server";
import { z } from "zod";
import { FieldNotFoundError, correctField } from "@/server/review";

export const runtime = "nodejs";

const CorrectBody = z.object({
  // Null clears a value the model invented. Zod guards the boundary here the
  // same way it guards model output.
  value: z.string().max(500).nullable(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse<{ ok: true } | { error: string }>> {
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send a value to correct this to." }, { status: 400 });
  }

  const parsed = CorrectBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "That value is too long. Shorten it and try again." },
      { status: 400 },
    );
  }

  try {
    await correctField(id, parsed.data.value);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof FieldNotFoundError) {
      return NextResponse.json({ error: "That field is not here." }, { status: 404 });
    }
    // planCorrection refuses an unchanged value: that is a confirmation, and
    // recording it as a correction would count against the model wrongly.
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save that correction." },
      { status: 422 },
    );
  }
}
