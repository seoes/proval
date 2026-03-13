CREATE TABLE `repository` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`provider` text NOT NULL,
	`base_url` text NOT NULL,
	`api_token` text NOT NULL,
	`webhook_secret` text,
	`bot_username` text,
	`note_reply_mode` text DEFAULT 'off' NOT NULL,
	`auto_assign` integer DEFAULT false NOT NULL,
	`language` text DEFAULT 'English' NOT NULL,
	`gitlab_repository_id` integer,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
