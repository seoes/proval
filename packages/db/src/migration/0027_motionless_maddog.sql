ALTER TABLE `model` RENAME TO `model_provider`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_activity` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`repository_id` integer NOT NULL,
	`model_provider_id` integer NOT NULL,
	`model_name` text NOT NULL,
	`type` text NOT NULL,
	`status` text NOT NULL,
	`target_iid` integer NOT NULL,
	`input_token` integer,
	`cached_input_token` integer,
	`output_token` integer,
	`error_message` text,
	`completed_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`repository_id`) REFERENCES `repository`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`model_provider_id`) REFERENCES `model_provider`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_activity`("id", "repository_id", "model_provider_id", "model_name", "type", "status", "target_iid", "input_token", "cached_input_token", "output_token", "error_message", "completed_at", "created_at", "updated_at")
SELECT
	a."id",
	a."repository_id",
	a."model_id",
	COALESCE(mp."name", ''),
	a."type",
	a."status",
	a."target_iid",
	a."input_token",
	a."cached_input_token",
	a."output_token",
	a."error_message",
	a."completed_at",
	a."created_at",
	a."updated_at"
FROM `activity` a
LEFT JOIN `model_provider` mp ON mp."id" = a."model_id";--> statement-breakpoint
DROP TABLE `activity`;--> statement-breakpoint
ALTER TABLE `__new_activity` RENAME TO `activity`;--> statement-breakpoint
CREATE INDEX `activity_repository_id_created_at_idx` ON `activity` (`repository_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `activity_model_provider_id_created_at_idx` ON `activity` (`model_provider_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `__new_repository` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`path` text NOT NULL,
	`description` text,
	`provider` text NOT NULL,
	`webhook_secret` text NOT NULL,
	`language` text DEFAULT 'English' NOT NULL,
	`github_installation_id` integer,
	`github_repository_id` integer,
	`git_provider_access_id` integer,
	`git_provider_repository_id` integer,
	`review_on_pull_request_open` integer DEFAULT true NOT NULL,
	`inline_review` integer DEFAULT true NOT NULL,
	`reply_to_pull_request_comment` text DEFAULT 'all' NOT NULL,
	`deep_research_on_pull_request` integer DEFAULT false NOT NULL,
	`comment_on_issue_open` integer DEFAULT true NOT NULL,
	`reply_to_issue_comment` text DEFAULT 'all' NOT NULL,
	`model_provider_id` integer,
	`model_name` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`github_installation_id`) REFERENCES `github_installation`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`git_provider_access_id`) REFERENCES `git_provider_access`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`model_provider_id`) REFERENCES `model_provider`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_repository`("id", "path", "description", "provider", "webhook_secret", "language", "github_installation_id", "github_repository_id", "git_provider_access_id", "git_provider_repository_id", "review_on_pull_request_open", "inline_review", "reply_to_pull_request_comment", "deep_research_on_pull_request", "comment_on_issue_open", "reply_to_issue_comment", "model_provider_id", "model_name", "created_at", "updated_at")
SELECT
	r."id",
	r."path",
	r."description",
	r."provider",
	r."webhook_secret",
	r."language",
	r."github_installation_id",
	r."github_repository_id",
	r."git_provider_access_id",
	r."git_provider_repository_id",
	r."review_on_pull_request_open",
	r."inline_review",
	r."reply_to_pull_request_comment",
	r."deep_research_on_pull_request",
	r."comment_on_issue_open",
	r."reply_to_issue_comment",
	r."model_id",
	COALESCE(mp."name", ''),
	r."created_at",
	r."updated_at"
FROM `repository` r
LEFT JOIN `model_provider` mp ON mp."id" = r."model_id";--> statement-breakpoint
DROP TABLE `repository`;--> statement-breakpoint
ALTER TABLE `__new_repository` RENAME TO `repository`;--> statement-breakpoint
CREATE UNIQUE INDEX `repository_gitProviderRepositoryId_gitProviderAccessId_unique` ON `repository` (`git_provider_repository_id`,`git_provider_access_id`);--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
ALTER TABLE `model_provider` DROP COLUMN `name`;
