import { NextResponse } from "next/server";
import { loadReview } from "@/server/review";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
  A document's fields as JSON.

  This exists so scripts/seed.mjs can drive the product entirely over HTTP: it
  needs field ids before it can confirm or correct anything, and the alternative
  was giving the seed a database connection. Pure HTTP means the seed can point
  at any deployment without carrying that deployment's credentials.

  Read only, and it exposes nothing the review screen does not already render at
  /review/[id]. Authentication is out of scope for version one across the whole
  product, so this adds no surface that was not already open.
*/

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const review = await loadReview(id);

  if (!review) {
    return NextResponse.json({ error: "That document is not here." }, { status: 404 });
  }

  return NextResponse.json({
    id: review.id,
    state: review.state,
    fields: review.fields.map((field) => ({
      id: field.id,
      name: field.name,
      value: field.value,
      confidence: field.confidence,
      status: field.status,
      // scripts/box-eval.mjs compares this against where the value really is.
      // Leaving it out cost an afternoon: the eval read undefined and reported
      // that the model had placed no boxes at all, when it had placed them fine.
      box: field.box,
    })),
  });
}
