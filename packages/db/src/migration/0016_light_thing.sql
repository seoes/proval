CREATE TABLE `git_provider_access` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`provider` text NOT NULL,
	`name` text NOT NULL,
	`base_url` text NOT NULL,
	`access_token` text NOT NULL,
	`bot_username` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
ALTER TABLE `repository` ADD `git_provider_access_id` integer REFERENCES git_provider_access(id);--> statement-breakpoint
ALTER TABLE `repository` DROP COLUMN `base_url`;--> statement-breakpoint
ALTER TABLE `repository` DROP COLUMN `gitlab_access_token`;