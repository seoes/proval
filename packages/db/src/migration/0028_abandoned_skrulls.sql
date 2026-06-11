PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_activity` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`repository_id` integer NOT NULL,
	`model_provider_id` integer,
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
	FOREIGN KEY (`model_provider_id`) REFERENCES `model_provider`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_activity`("id", "repository_id", "model_provider_id", "model_name", "type", "status", "target_iid", "input_token", "cached_input_token", "output_token", "error_message", "completed_at", "created_at", "updated_at") SELECT "id", "repository_id", "model_provider_id", "model_name", "type", "status", "target_iid", "input_token", "cached_input_token", "output_token", "error_message", "completed_at", "created_at", "updated_at" FROM `activity`;--> statement-breakpoint
DROP TABLE `activity`;--> statement-breakpoint
ALTER TABLE `__new_activity` RENAME TO `activity`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `activity_repository_id_created_at_idx` ON `activity` (`repository_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `activity_model_provider_id_created_at_idx` ON `activity` (`model_provider_id`,`created_at`);