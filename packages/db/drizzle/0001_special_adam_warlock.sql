ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "description" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "category" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "brand" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "country_of_origin" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "attributes" jsonb;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "info_updated_at" timestamp;
