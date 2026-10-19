CREATE TABLE `api_token` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`token_prefix` text NOT NULL,
	`scope_list` text DEFAULT '' NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer,
	`last_used_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_token_tokenHash_unique` ON `api_token` (`token_hash`);--> statement-breakpoint
CREATE INDEX `api_token_user_id_idx` ON `api_token` (`user_id`);