ALTER TABLE `repository` ADD `inline_review_mode` text DEFAULT 'important_only' NOT NULL;--> statement-breakpoint
ALTER TABLE `repository` ADD `review_depth` text DEFAULT 'standard' NOT NULL;