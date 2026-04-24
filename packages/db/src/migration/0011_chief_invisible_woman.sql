ALTER TABLE `repository` ADD `review_on_merge_request_open` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `repository` ADD `comment_on_issue_open` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `repository` ADD `reply_to_merge_request_comment` text DEFAULT 'off' NOT NULL;--> statement-breakpoint
ALTER TABLE `repository` ADD `reply_to_issue_comment` text DEFAULT 'off' NOT NULL;--> statement-breakpoint
ALTER TABLE `repository` ADD `inline_review` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `repository` DROP COLUMN `review_mode`;--> statement-breakpoint
ALTER TABLE `repository` DROP COLUMN `reply_mode`;--> statement-breakpoint
ALTER TABLE `repository` DROP COLUMN `auto_assign`;--> statement-breakpoint
ALTER TABLE `repository` DROP COLUMN `allow_approval`;--> statement-breakpoint
ALTER TABLE `repository` DROP COLUMN `inline_review_mode`;--> statement-breakpoint
ALTER TABLE `repository` DROP COLUMN `review_depth`;