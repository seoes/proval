ALTER TABLE `activity` ADD `head_sha` text;--> statement-breakpoint
ALTER TABLE `repository` ADD `review_on_pull_request_push` text DEFAULT 'on_every_push' NOT NULL;--> statement-breakpoint
ALTER TABLE `repository` ADD `ignore_draft_pull_request` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `repository` DROP COLUMN `review_on_pull_request_open`;