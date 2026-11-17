-- SQLite cannot add a column with a parenthesized default. The constant only covers raw inserts that omit the column.
ALTER TABLE `activity` ADD `queued_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE `activity` SET `queued_at` = `created_at`;
