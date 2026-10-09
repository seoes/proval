PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_model_provider` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`provider` text NOT NULL,
	`label` text NOT NULL,
	`base_url` text NOT NULL,
	`api_key` text,
	`auth_method` text DEFAULT 'api_key' NOT NULL,
	`oauth_credential` text,
	`oauth_status` text,
	`timeout_second` integer DEFAULT 600 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_model_provider`("id", "provider", "label", "base_url", "api_key", "timeout_second", "created_at", "updated_at") SELECT "id", "provider", "label", "base_url", "api_key", "timeout_second", "created_at", "updated_at" FROM `model_provider`;--> statement-breakpoint
DROP TABLE `model_provider`;--> statement-breakpoint
ALTER TABLE `__new_model_provider` RENAME TO `model_provider`;--> statement-breakpoint
PRAGMA foreign_keys=ON;