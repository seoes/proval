CREATE TABLE `github_app` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`app_id` integer NOT NULL,
	`slug` text NOT NULL,
	`private_key` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `github_app_appId_unique` ON `github_app` (`app_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `github_app_slug_unique` ON `github_app` (`slug`);--> statement-breakpoint
ALTER TABLE `repository` ADD `github_app_id` integer REFERENCES github_app(id);--> statement-breakpoint
ALTER TABLE `repository` ADD `github_installation_id` integer;