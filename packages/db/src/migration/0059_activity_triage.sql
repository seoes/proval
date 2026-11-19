ALTER TABLE `activity` ADD `triage` text;--> statement-breakpoint
ALTER TABLE `repository` ADD `pr_triage_enabled` integer DEFAULT false NOT NULL;