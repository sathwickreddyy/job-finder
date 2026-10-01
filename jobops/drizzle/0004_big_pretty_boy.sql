CREATE TABLE "company_fact_observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fact_id" uuid NOT NULL,
	"snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_facts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"fact_key" text NOT NULL,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source_url" text NOT NULL,
	"source_title" text DEFAULT '' NOT NULL,
	"source_kind" text DEFAULT 'OTHER' NOT NULL,
	"verification_status" text DEFAULT 'UNVERIFIED' NOT NULL,
	"confidence" real,
	"occurred_at" timestamp with time zone,
	"first_observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_facts_confidence_check" CHECK ("company_facts"."confidence" IS NULL OR ("company_facts"."confidence" >= 0 AND "company_facts"."confidence" <= 1))
);
--> statement-breakpoint
CREATE TABLE "company_locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"location_key" text NOT NULL,
	"city" text NOT NULL,
	"state" text DEFAULT '' NOT NULL,
	"country" text DEFAULT 'India' NOT NULL,
	"work_modes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"source_url" text,
	"verification_status" text DEFAULT 'UNVERIFIED' NOT NULL,
	"first_observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_observed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"aliases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"focus" text DEFAULT '' NOT NULL,
	"website_url" text,
	"careers_url" text,
	"portal_note" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "companies_status_check" CHECK ("companies"."status" IN ('ACTIVE','ARCHIVED'))
);
--> statement-breakpoint
ALTER TABLE "company_fact_observations" ADD CONSTRAINT "company_fact_observations_fact_id_company_facts_id_fk" FOREIGN KEY ("fact_id") REFERENCES "public"."company_facts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_facts" ADD CONSTRAINT "company_facts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_locations" ADD CONSTRAINT "company_locations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "company_fact_observations_fact_idx" ON "company_fact_observations" USING btree ("fact_id","observed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "company_facts_key_idx" ON "company_facts" USING btree ("company_id","fact_key");--> statement-breakpoint
CREATE INDEX "company_facts_category_idx" ON "company_facts" USING btree ("company_id","category");--> statement-breakpoint
CREATE UNIQUE INDEX "company_locations_key_idx" ON "company_locations" USING btree ("company_id","location_key");--> statement-breakpoint
CREATE INDEX "company_locations_city_idx" ON "company_locations" USING btree ("city");--> statement-breakpoint
CREATE UNIQUE INDEX "companies_slug_idx" ON "companies" USING btree ("slug");
--> statement-breakpoint
-- Preserve the existing eight real companies and their reviewed official location sources.
INSERT INTO companies (slug,name,aliases,focus,careers_url,portal_note) VALUES ('google','Google','["Google India","Google LLC"]'::jsonb,'Search, cloud & AI','https://www.google.com/about/careers/applications/jobs/results/?location=India','Google Careers · Choose Bengaluru or Hyderabad in the location filter.') ON CONFLICT (slug) DO NOTHING;
--> statement-breakpoint
INSERT INTO company_locations (company_id,location_key,city,state,country,source_url,verification_status,first_observed_at,last_observed_at) SELECT id,'bengaluru|karnataka|india','Bengaluru','Karnataka','India','https://www.google.com/about/careers/applications/jobs/results/?location=India','VERIFIED','2026-10-01T00:00:00Z'::timestamptz,'2026-10-01T00:00:00Z'::timestamptz FROM companies WHERE slug='google' ON CONFLICT (company_id,location_key) DO NOTHING;
--> statement-breakpoint
INSERT INTO company_locations (company_id,location_key,city,state,country,source_url,verification_status,first_observed_at,last_observed_at) SELECT id,'hyderabad|telangana|india','Hyderabad','Telangana','India','https://www.google.com/about/careers/applications/jobs/results/?location=India','VERIFIED','2026-10-01T00:00:00Z'::timestamptz,'2026-10-01T00:00:00Z'::timestamptz FROM companies WHERE slug='google' ON CONFLICT (company_id,location_key) DO NOTHING;
--> statement-breakpoint
INSERT INTO companies (slug,name,aliases,focus,careers_url,portal_note) VALUES ('microsoft','Microsoft','["Microsoft India","Microsoft India Development Center"]'::jsonb,'Cloud, developer tools & AI','https://careers.microsoft.com/','Microsoft Careers · Filter by India, then your preferred city.') ON CONFLICT (slug) DO NOTHING;
--> statement-breakpoint
INSERT INTO company_locations (company_id,location_key,city,state,country,source_url,verification_status,first_observed_at,last_observed_at) SELECT id,'bengaluru|karnataka|india','Bengaluru','Karnataka','India','https://www.microsoft.com/en-in/msidc','VERIFIED','2026-10-01T00:00:00Z'::timestamptz,'2026-10-01T00:00:00Z'::timestamptz FROM companies WHERE slug='microsoft' ON CONFLICT (company_id,location_key) DO NOTHING;
--> statement-breakpoint
INSERT INTO company_locations (company_id,location_key,city,state,country,source_url,verification_status,first_observed_at,last_observed_at) SELECT id,'hyderabad|telangana|india','Hyderabad','Telangana','India','https://www.microsoft.com/en-in/msidc','VERIFIED','2026-10-01T00:00:00Z'::timestamptz,'2026-10-01T00:00:00Z'::timestamptz FROM companies WHERE slug='microsoft' ON CONFLICT (company_id,location_key) DO NOTHING;
--> statement-breakpoint
INSERT INTO companies (slug,name,aliases,focus,careers_url,portal_note) VALUES ('amazon','Amazon','["Amazon India","Amazon Web Services","AWS"]'::jsonb,'Commerce, cloud & infrastructure','https://www.amazon.jobs/en/search?country=IND&loc_query=India','Amazon Jobs · India search, including Amazon and AWS teams.') ON CONFLICT (slug) DO NOTHING;
--> statement-breakpoint
INSERT INTO company_locations (company_id,location_key,city,state,country,source_url,verification_status,first_observed_at,last_observed_at) SELECT id,'bengaluru|karnataka|india','Bengaluru','Karnataka','India','https://www.amazon.jobs/en/search?country=IND&loc_query=India','VERIFIED','2026-10-01T00:00:00Z'::timestamptz,'2026-10-01T00:00:00Z'::timestamptz FROM companies WHERE slug='amazon' ON CONFLICT (company_id,location_key) DO NOTHING;
--> statement-breakpoint
INSERT INTO company_locations (company_id,location_key,city,state,country,source_url,verification_status,first_observed_at,last_observed_at) SELECT id,'hyderabad|telangana|india','Hyderabad','Telangana','India','https://www.amazon.jobs/en/search?country=IND&loc_query=India','VERIFIED','2026-10-01T00:00:00Z'::timestamptz,'2026-10-01T00:00:00Z'::timestamptz FROM companies WHERE slug='amazon' ON CONFLICT (company_id,location_key) DO NOTHING;
--> statement-breakpoint
INSERT INTO companies (slug,name,aliases,focus,careers_url,portal_note) VALUES ('salesforce','Salesforce','["Salesforce India","Salesforce.com"]'::jsonb,'CRM & enterprise platforms','https://careers.salesforce.com/en/our-locations/asia-pacific/india/','Salesforce Careers · India page with links to open roles.') ON CONFLICT (slug) DO NOTHING;
--> statement-breakpoint
INSERT INTO company_locations (company_id,location_key,city,state,country,source_url,verification_status,first_observed_at,last_observed_at) SELECT id,'bengaluru|karnataka|india','Bengaluru','Karnataka','India','https://careers.salesforce.com/en/our-locations/asia-pacific/india/','VERIFIED','2026-10-01T00:00:00Z'::timestamptz,'2026-10-01T00:00:00Z'::timestamptz FROM companies WHERE slug='salesforce' ON CONFLICT (company_id,location_key) DO NOTHING;
--> statement-breakpoint
INSERT INTO company_locations (company_id,location_key,city,state,country,source_url,verification_status,first_observed_at,last_observed_at) SELECT id,'hyderabad|telangana|india','Hyderabad','Telangana','India','https://careers.salesforce.com/en/our-locations/asia-pacific/india/','VERIFIED','2026-10-01T00:00:00Z'::timestamptz,'2026-10-01T00:00:00Z'::timestamptz FROM companies WHERE slug='salesforce' ON CONFLICT (company_id,location_key) DO NOTHING;
--> statement-breakpoint
INSERT INTO companies (slug,name,aliases,focus,careers_url,portal_note) VALUES ('servicenow','ServiceNow','["ServiceNow India","Service Now"]'::jsonb,'Enterprise workflows & AI','https://careers.servicenow.com/locations/apj/india/','ServiceNow Careers · India locations and job search.') ON CONFLICT (slug) DO NOTHING;
--> statement-breakpoint
INSERT INTO company_locations (company_id,location_key,city,state,country,source_url,verification_status,first_observed_at,last_observed_at) SELECT id,'bengaluru|karnataka|india','Bengaluru','Karnataka','India','https://careers.servicenow.com/locations/apj/india/','VERIFIED','2026-10-01T00:00:00Z'::timestamptz,'2026-10-01T00:00:00Z'::timestamptz FROM companies WHERE slug='servicenow' ON CONFLICT (company_id,location_key) DO NOTHING;
--> statement-breakpoint
INSERT INTO company_locations (company_id,location_key,city,state,country,source_url,verification_status,first_observed_at,last_observed_at) SELECT id,'hyderabad|telangana|india','Hyderabad','Telangana','India','https://careers.servicenow.com/locations/apj/india/','VERIFIED','2026-10-01T00:00:00Z'::timestamptz,'2026-10-01T00:00:00Z'::timestamptz FROM companies WHERE slug='servicenow' ON CONFLICT (company_id,location_key) DO NOTHING;
--> statement-breakpoint
INSERT INTO companies (slug,name,aliases,focus,careers_url,portal_note) VALUES ('oracle','Oracle','["Oracle India"]'::jsonb,'Databases & cloud platforms','https://careers.oracle.com/en/sites/jobsearch/?hl=en-IN','Oracle Careers · Set the location to Bengaluru or Hyderabad.') ON CONFLICT (slug) DO NOTHING;
--> statement-breakpoint
INSERT INTO company_locations (company_id,location_key,city,state,country,source_url,verification_status,first_observed_at,last_observed_at) SELECT id,'bengaluru|karnataka|india','Bengaluru','Karnataka','India','https://www.oracle.com/a/ocom/docs/service-locations-073430.pdf','VERIFIED','2026-10-01T00:00:00Z'::timestamptz,'2026-10-01T00:00:00Z'::timestamptz FROM companies WHERE slug='oracle' ON CONFLICT (company_id,location_key) DO NOTHING;
--> statement-breakpoint
INSERT INTO company_locations (company_id,location_key,city,state,country,source_url,verification_status,first_observed_at,last_observed_at) SELECT id,'hyderabad|telangana|india','Hyderabad','Telangana','India','https://www.oracle.com/a/ocom/docs/service-locations-073430.pdf','VERIFIED','2026-10-01T00:00:00Z'::timestamptz,'2026-10-01T00:00:00Z'::timestamptz FROM companies WHERE slug='oracle' ON CONFLICT (company_id,location_key) DO NOTHING;
--> statement-breakpoint
INSERT INTO companies (slug,name,aliases,focus,careers_url,portal_note) VALUES ('atlassian','Atlassian','["Atlassian India"]'::jsonb,'Developer tools & collaboration','https://www.atlassian.com/company/careers/all-jobs','Atlassian Careers · Filter by India and check each role’s location.') ON CONFLICT (slug) DO NOTHING;
--> statement-breakpoint
INSERT INTO company_locations (company_id,location_key,city,state,country,source_url,verification_status,first_observed_at,last_observed_at) SELECT id,'bengaluru|karnataka|india','Bengaluru','Karnataka','India','https://www.atlassian.com/company/careers','VERIFIED','2026-10-01T00:00:00Z'::timestamptz,'2026-10-01T00:00:00Z'::timestamptz FROM companies WHERE slug='atlassian' ON CONFLICT (company_id,location_key) DO NOTHING;
--> statement-breakpoint
INSERT INTO companies (slug,name,aliases,focus,careers_url,portal_note) VALUES ('razorpay','Razorpay','["Razorpay Software","Razorpay Software Private Limited"]'::jsonb,'Payments & financial technology','https://razorpay.com/careers/','Razorpay Careers · Open all jobs and check the role’s city.') ON CONFLICT (slug) DO NOTHING;
--> statement-breakpoint
INSERT INTO company_locations (company_id,location_key,city,state,country,source_url,verification_status,first_observed_at,last_observed_at) SELECT id,'bengaluru|karnataka|india','Bengaluru','Karnataka','India','https://razorpay.com/return-to-work-program/','VERIFIED','2026-10-01T00:00:00Z'::timestamptz,'2026-10-01T00:00:00Z'::timestamptz FROM companies WHERE slug='razorpay' ON CONFLICT (company_id,location_key) DO NOTHING;
--> statement-breakpoint
