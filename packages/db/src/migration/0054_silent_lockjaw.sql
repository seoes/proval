ALTER TABLE `git_provider_access` ADD `default_pr_review_on_close` text DEFAULT 'continue';--> statement-breakpoint
ALTER TABLE `repository` ADD `pr_review_on_close` text DEFAULT 'continue' NOT NULL;