import { notFound } from "next/navigation";
import { loadReview } from "@/server/review";
import { reviewerHandle } from "@/server/reviewer";
import { ReviewScreen } from "@/ui/review/review-screen";

export const runtime = "nodejs";
// A reviewer's own edits must be visible the moment they reload.
export const dynamic = "force-dynamic";

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const review = await loadReview(id);

  if (!review) notFound();

  return <ReviewScreen review={review} reviewer={reviewerHandle()} />;
}
