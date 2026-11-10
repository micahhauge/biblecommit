CREATE TABLE "books" (
	"id" smallint PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"short_name" text NOT NULL,
	"section" text NOT NULL,
	"chapter_count" smallint NOT NULL,
	"first_verse_id" integer NOT NULL,
	"last_verse_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chapters" (
	"id" smallint PRIMARY KEY NOT NULL,
	"book_id" smallint NOT NULL,
	"number" smallint NOT NULL,
	"verse_count" smallint NOT NULL,
	"first_verse_id" integer NOT NULL,
	"last_verse_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commit_ranges" (
	"commit_id" uuid NOT NULL,
	"start_verse_id" integer NOT NULL,
	"end_verse_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"read_on" date NOT NULL,
	"raw_input" text NOT NULL,
	"display" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" text,
	"guest_token_hash" text,
	"timezone" text NOT NULL,
	"mode_pref" text DEFAULT 'system' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_clerk_user_id_unique" UNIQUE("clerk_user_id"),
	CONSTRAINT "users_guest_token_hash_unique" UNIQUE("guest_token_hash")
);
--> statement-breakpoint
ALTER TABLE "chapters" ADD CONSTRAINT "chapters_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commit_ranges" ADD CONSTRAINT "commit_ranges_commit_id_commits_id_fk" FOREIGN KEY ("commit_id") REFERENCES "public"."commits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commits" ADD CONSTRAINT "commits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chapters_book_id_idx" ON "chapters" USING btree ("book_id");--> statement-breakpoint
CREATE INDEX "commit_ranges_commit_id_idx" ON "commit_ranges" USING btree ("commit_id");--> statement-breakpoint
CREATE INDEX "commits_user_id_read_on_idx" ON "commits" USING btree ("user_id","read_on");