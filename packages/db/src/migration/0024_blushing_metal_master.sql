CREATE TABLE `activity` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`repository_id` integer NOT NULL,
	`model_id` integer NOT NULL,
	`type` text NOT NULL,
	`status` text NOT NULL,
	`target_iid` integer NOT NULL,
	`input_token` integer,
	`output_token` integer,
	`error_message` text,
	`completed_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`repository_id`) REFERENCES `repository`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`model_id`) REFERENCES `model`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `activity_repository_id_created_at_idx` ON `activity` (`repository_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `activity_model_id_created_at_idx` ON `activity` (`model_id`,`created_at`);