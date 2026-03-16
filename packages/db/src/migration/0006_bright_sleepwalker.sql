PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_model` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`provider` text NOT NULL,
	`name` text NOT NULL,
	`label` text NOT NULL,
	`base_url` text NOT NULL,
	`api_key` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_model`("id", "provider", "name", "label", "base_url", "api_key", "created_at", "updated_at") SELECT "id", "provider", "name", "label", "base_url", "api_key", "created_at", "updated_at" FROM `model`;--> statement-breakpoint
DROP TABLE `model`;--> statement-breakpoint
ALTER TABLE `__new_model` RENAME TO `model`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_repository` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`provider` text NOT NULL,
	`base_url` text NOT NULL,
	`api_token` text NOT NULL,
	`webhook_secret` text,
	`bot_username` text,
	`review_mode` text DEFAULT 'off' NOT NULL,
	`reply_mode` text DEFAULT 'off' NOT NULL,
	`auto_assign` integer DEFAULT false NOT NULL,
	`language` text DEFAULT 'English' NOT NULL,
	`gitlab_repository_id` integer,
	`model_id` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`model_id`) REFERENCES `model`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_repository`("id", "name", "provider", "base_url", "api_token", "webhook_secret", "bot_username", "review_mode", "reply_mode", "auto_assign", "language", "gitlab_repository_id", "model_id", "created_at", "updated_at") SELECT "id", "name", "provider", "base_url", "api_token", "webhook_secret", "bot_username", "review_mode", "reply_mode", "auto_assign", "language", "gitlab_repository_id", "model_id", "created_at", "updated_at" FROM `repository`;--> statement-breakpoint
DROP TABLE `repository`;--> statement-breakpoint
ALTER TABLE `__new_repository` RENAME TO `repository`;