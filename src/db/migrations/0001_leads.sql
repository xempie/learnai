CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"org_domain" text,
	"org_name" text,
	"org_id" uuid,
	"service_interest" text NOT NULL,
	"team_size" integer,
	"message" text,
	"is_team" boolean DEFAULT false NOT NULL,
	"source" text DEFAULT 'platform' NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"notes" text,
	"qualified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leads_service" CHECK ("leads"."service_interest" in ('workshop','advisory','pilot_sprint','training','team_platform','other')),
	CONSTRAINT "leads_status" CHECK ("leads"."status" in ('new','contacted','qualified','converted','closed'))
);
--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "leads_status_idx" ON "leads" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "leads_qualified_idx" ON "leads" USING btree ("qualified_at");