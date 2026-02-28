CREATE TYPE "bq_queue"."job_type" AS ENUM('one_off', 'dynamic');--> statement-breakpoint
CREATE TABLE "bq_queue"."job_idempotency" (
	"idempotency_key" text PRIMARY KEY NOT NULL,
	"job_type" "bq_queue"."job_type" NOT NULL,
	"pg_boss_job_id" text NOT NULL,
	"queue" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
