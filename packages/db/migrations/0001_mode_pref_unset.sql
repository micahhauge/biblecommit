ALTER TABLE "users" ALTER COLUMN "mode_pref" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "mode_pref" DROP NOT NULL;--> statement-breakpoint
-- No UI could set it before now, so every stored value is the untouched default: let browsers choose.
UPDATE "users" SET "mode_pref" = NULL;
