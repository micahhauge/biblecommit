CREATE TABLE "note_ranges" (
	"note_id" uuid NOT NULL,
	"start_verse_id" integer NOT NULL,
	"end_verse_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"written_on" date NOT NULL,
	"body" text NOT NULL,
	"verses_input" text DEFAULT '' NOT NULL,
	"verses_display" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "note_ranges" ADD CONSTRAINT "note_ranges_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "note_ranges_note_id_idx" ON "note_ranges" USING btree ("note_id");--> statement-breakpoint
CREATE INDEX "note_ranges_verses_idx" ON "note_ranges" USING btree ("start_verse_id","end_verse_id");--> statement-breakpoint
CREATE INDEX "notes_user_id_written_on_idx" ON "notes" USING btree ("user_id","written_on");