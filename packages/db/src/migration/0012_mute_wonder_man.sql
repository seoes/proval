PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_repository` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`provider` text NOT NULL,
	`base_url` text NOT NULL,
	`api_token` text NOT NULL,
	`webhook_secret` text,
	`bot_username` text,
	`language` text DEFAULT 'English' NOT NULL,
	`github_app_id` integer,
	`github_installation_id` integer,
	`github_repository_path` text,
	`gitlab_repository_id` integer,
	`review_on_merge_request_open` integer DEFAULT true NOT NULL,
	`inline_review` integer DEFAULT true NOT NULL,
	`reply_to_merge_request_comment` text DEFAULT 'all' NOT NULL,
	`comment_on_issue_open` integer DEFAULT true NOT NULL,
	`reply_to_issue_comment` text DEFAULT 'all' NOT NULL,
	`model_id` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`github_app_id`) REFERENCES `github_app`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`model_id`) REFERENCES `model`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_repository`("id", "name", "provider", "base_url", "api_token", "webhook_secret", "bot_username", "language", "github_app_id", "github_installation_id", "github_repository_path", "gitlab_repository_id", "review_on_merge_request_open", "inline_review", "reply_to_merge_request_comment", "comment_on_issue_open", "reply_to_issue_comment", "model_id", "created_at", "updated_at") SELECT "id", "name", "provider", "base_url", "api_token", "webhook_secret", "bot_username", "language", "github_app_id", "github_installation_id", "github_repository_path", "gitlab_repository_id", "review_on_merge_request_open", "inline_review", "reply_to_merge_request_comment", "comment_on_issue_open", "reply_to_issue_comment", "model_id", "created_at", "updated_at" FROM `repository`;--> statement-breakpoint
DROP TABLE `repository`;--> statement-breakpoint
ALTER TABLE `__new_repository` RENAME TO `repository`;--> statement-breakpoint

UPDATE `repository` SET `review_on_merge_request_open` = true, `inline_review` = true, `reply_to_merge_request_comment` = 'all', `comment_on_issue_open` = true, `reply_to_issue_comment` = 'all';

PRAGMA foreign_keys=ON;