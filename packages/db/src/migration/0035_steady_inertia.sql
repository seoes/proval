ALTER TABLE `repository` RENAME COLUMN "inline_review" TO "pr_inline_review";--> statement-breakpoint
ALTER TABLE `repository` RENAME COLUMN "review_on_pull_request_push" TO "pr_review_on_push";--> statement-breakpoint
ALTER TABLE `repository` RENAME COLUMN "ignore_draft_pull_request" TO "pr_ignore_draft";--> statement-breakpoint
ALTER TABLE `repository` RENAME COLUMN "comment_on_issue_open" TO "issue_comment_on_open_enabled";--> statement-breakpoint
ALTER TABLE `repository` ADD `pr_enabled` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `repository` ADD `pr_min_access_level` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `repository` ADD `pr_review_enabled` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `repository` ADD `pr_reply_enabled` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `repository` ADD `pr_mention_only` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `repository` ADD `issue_enabled` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `repository` ADD `issue_min_access_level` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `repository` ADD `issue_reply_enabled` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `repository` ADD `issue_mention_only` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `repository` DROP COLUMN `reply_to_pull_request_comment`;--> statement-breakpoint
ALTER TABLE `repository` DROP COLUMN `reply_to_issue_comment`;