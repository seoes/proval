ALTER TABLE `repository` RENAME COLUMN "note_reply_mode" TO "reply_mode";--> statement-breakpoint
ALTER TABLE `repository` ADD `review_mode` text DEFAULT 'off' NOT NULL;