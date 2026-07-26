ALTER TABLE "fields" ADD COLUMN "initial_status" "field_status";--> statement-breakpoint
-- Backfill what can be recovered: a field's confidence against the threshold
-- that was in force on the extraction that produced it. Per specs/delivery.md,
-- add nullable, backfill, tighten later, so a rollback can still run.
--
-- `sampled` is deliberately not recovered here. It is a deterministic function
-- of the field's identity, and recomputing it in SQL would put the sampling rule
-- in a second place where it could silently disagree with src/domain/sampling.ts.
-- Rows backfilled as auto_accepted that were in fact sampled are excluded from
-- auto accept precision rather than counted wrongly, which is the safe direction.
UPDATE "fields" f
SET "initial_status" = CASE
  WHEN f."confidence" IS NULL THEN 'needs_review'::"field_status"
  WHEN f."confidence" >= e."threshold" THEN 'auto_accepted'::"field_status"
  ELSE 'needs_review'::"field_status"
END
FROM "extractions" e
WHERE e."id" = f."extraction_id"
  AND f."initial_status" IS NULL;
