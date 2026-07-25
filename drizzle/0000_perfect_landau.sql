CREATE TYPE "public"."document_state" AS ENUM('received', 'extracting', 'ready', 'in_review', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."extraction_source" AS ENUM('model', 'fallback');--> statement-breakpoint
CREATE TYPE "public"."field_name" AS ENUM('invoice_number', 'issue_date', 'due_date', 'supplier_name', 'supplier_tax_id', 'currency', 'subtotal', 'total');--> statement-breakpoint
CREATE TYPE "public"."field_status" AS ENUM('auto_accepted', 'needs_review', 'sampled', 'confirmed', 'corrected');--> statement-breakpoint
CREATE TABLE "batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seq" integer GENERATED ALWAYS AS IDENTITY (sequence name "batches_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "corrections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"field_id" uuid NOT NULL,
	"previous_value" text,
	"new_value" text,
	"reviewer_id" uuid NOT NULL,
	"extraction_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"filename" text NOT NULL,
	"content_hash" text NOT NULL,
	"blob_url" text NOT NULL,
	"mime_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"page_count" integer,
	"state" "document_state" DEFAULT 'received' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "extractions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"source" "extraction_source" NOT NULL,
	"model" text,
	"prompt_version" text NOT NULL,
	"threshold" double precision NOT NULL,
	"sample_rate" double precision NOT NULL,
	"image_width" integer,
	"latency_ms" integer,
	"input_tokens" integer,
	"output_tokens" integer,
	"attempt" integer DEFAULT 1 NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "extractions_threshold_range" CHECK ("extractions"."threshold" >= 0 AND "extractions"."threshold" <= 1),
	CONSTRAINT "extractions_sample_rate_range" CHECK ("extractions"."sample_rate" >= 0 AND "extractions"."sample_rate" <= 1)
);
--> statement-breakpoint
CREATE TABLE "fields" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"extraction_id" uuid,
	"name" "field_name" NOT NULL,
	"value" text,
	"confidence" double precision,
	"box_x0" double precision,
	"box_y0" double precision,
	"box_x1" double precision,
	"box_y1" double precision,
	"status" "field_status" DEFAULT 'needs_review' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fields_confidence_range" CHECK ("fields"."confidence" IS NULL OR ("fields"."confidence" >= 0 AND "fields"."confidence" <= 1)),
	CONSTRAINT "fields_box_normalised" CHECK (("fields"."box_x0" IS NULL OR ("fields"."box_x0" >= 0 AND "fields"."box_x0" <= 1))
        AND ("fields"."box_y0" IS NULL OR ("fields"."box_y0" >= 0 AND "fields"."box_y0" <= 1))
        AND ("fields"."box_x1" IS NULL OR ("fields"."box_x1" >= 0 AND "fields"."box_x1" <= 1))
        AND ("fields"."box_y1" IS NULL OR ("fields"."box_y1" >= 0 AND "fields"."box_y1" <= 1))),
	CONSTRAINT "fields_box_complete" CHECK (num_nonnulls("fields"."box_x0", "fields"."box_y0", "fields"."box_x1", "fields"."box_y1") IN (0, 4))
);
--> statement-breakpoint
CREATE TABLE "reviewers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"handle" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reviewers_handle_unique" UNIQUE("handle")
);
--> statement-breakpoint
ALTER TABLE "corrections" ADD CONSTRAINT "corrections_field_id_fields_id_fk" FOREIGN KEY ("field_id") REFERENCES "public"."fields"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corrections" ADD CONSTRAINT "corrections_reviewer_id_reviewers_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."reviewers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corrections" ADD CONSTRAINT "corrections_extraction_id_extractions_id_fk" FOREIGN KEY ("extraction_id") REFERENCES "public"."extractions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extractions" ADD CONSTRAINT "extractions_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fields" ADD CONSTRAINT "fields_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fields" ADD CONSTRAINT "fields_extraction_id_extractions_id_fk" FOREIGN KEY ("extraction_id") REFERENCES "public"."extractions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "corrections_field_id_idx" ON "corrections" USING btree ("field_id");--> statement-breakpoint
CREATE INDEX "corrections_reviewer_id_idx" ON "corrections" USING btree ("reviewer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "documents_content_hash_key" ON "documents" USING btree ("content_hash");--> statement-breakpoint
CREATE INDEX "documents_batch_id_idx" ON "documents" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "documents_state_idx" ON "documents" USING btree ("state");--> statement-breakpoint
CREATE INDEX "extractions_document_id_idx" ON "extractions" USING btree ("document_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fields_document_id_name_key" ON "fields" USING btree ("document_id","name");--> statement-breakpoint
CREATE INDEX "fields_document_id_idx" ON "fields" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "fields_status_idx" ON "fields" USING btree ("status");