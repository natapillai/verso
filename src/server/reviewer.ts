import { eq } from "drizzle-orm";
import { db } from "./db/client";
import { reviewers } from "./db/schema";

/*
  Who is reviewing.

  specs/product.md puts authentication out of scope, and specs/domain.md says a
  reviewer is "a human, identified by handle. No password in version one." So
  this is one row, created on demand, named by an environment variable.

  It is enough for success criterion 3, which asks that a correction name who
  made it. It is not enough for two people working the same batch, and a handle
  picker is the obvious next step — that belongs in the README rather than here.
*/

const DEFAULT_HANDLE = "nata";

export function reviewerHandle(): string {
  return process.env.REVIEWER_HANDLE?.trim() || DEFAULT_HANDLE;
}

export async function currentReviewerId(): Promise<string> {
  const handle = reviewerHandle();

  const [existing] = await db
    .select({ id: reviewers.id })
    .from(reviewers)
    .where(eq(reviewers.handle, handle))
    .limit(1);

  if (existing) return existing.id;

  const [created] = await db
    .insert(reviewers)
    .values({ handle })
    .onConflictDoNothing({ target: reviewers.handle })
    .returning({ id: reviewers.id });

  if (created) return created.id;

  // Lost a race with a concurrent first request; the other one won.
  const [winner] = await db
    .select({ id: reviewers.id })
    .from(reviewers)
    .where(eq(reviewers.handle, handle))
    .limit(1);

  if (!winner) throw new Error(`Could not open a reviewer for ${handle}.`);
  return winner.id;
}
