PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_repository` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`provider` text NOT NULL,
	`webhook_secret` text,
	`bot_username` text,
	`language` text DEFAULT 'English' NOT NULL,
	`github_installation_id` integer,
	`github_repository_path` text,
	`github_repository_id` integer,
	`git_provider_access_id` integer,
	`gitlab_repository_id` integer,
	`review_on_merge_request_open` integer DEFAULT true NOT NULL,
	`inline_review` integer DEFAULT true NOT NULL,
	`reply_to_merge_request_comment` text DEFAULT 'all' NOT NULL,
	`deep_research_on_merge_request` integer DEFAULT false NOT NULL,
	`comment_on_issue_open` integer DEFAULT true NOT NULL,
	`reply_to_issue_comment` text DEFAULT 'all' NOT NULL,
	`model_id` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`github_installation_id`) REFERENCES `github_installation`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`git_provider_access_id`) REFERENCES `git_provider_access`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`model_id`) REFERENCES `model`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_repository`("id", "name", "provider", "webhook_secret", "bot_username", "language", "github_installation_id", "github_repository_path", "github_repository_id", "git_provider_access_id", "gitlab_repository_id", "review_on_merge_request_open", "inline_review", "reply_to_merge_request_comment", "deep_research_on_merge_request", "comment_on_issue_open", "reply_to_issue_comment", "model_id", "created_at", "updated_at") SELECT "id", "name", "provider", "webhook_secret", "bot_username", "language", "github_installation_id", "github_repository_path", "github_repository_id", "git_provider_access_id", "gitlab_repository_id", "review_on_merge_request_open", "inline_review", "reply_to_merge_request_comment", "deep_research_on_merge_request", "comment_on_issue_open", "reply_to_issue_comment", "model_id", "created_at", "updated_at" FROM `repository`;--> statement-breakpoint
DROP TABLE `repository`;--> statement-breakpoint
ALTER TABLE `__new_repository` RENAME TO `repository`;--> statement-breakpoint
PRAGMA foreign_keys=ON;