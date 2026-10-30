ALTER TABLE `activity` ADD `started_at` integer;--> statement-breakpoint
UPDATE `activity` SET `started_at` = `created_at` WHERE `status` != 'queued';
